"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { now } from "@/lib/format";
import { applyOrderToTicket, clientDocId, orderDocId, shopShortName } from "@/lib/orders";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { fetchAllDocs, upsertDocs, type DocRow } from "@/lib/supabase/docs";
import { slaFor as slaForTicket, type SlaLimits } from "@/lib/tickets";
import { DEFAULT_SETTINGS, type Client, type Order, type Settings, type SyncState, type Ticket } from "@/lib/types";
import { useUi } from "./UiProvider";

interface Me {
  id: string;
  email: string;
  name: string;
}

interface DataContext {
  ready: boolean;
  loadError: string;
  me: Me | null;
  tickets: Ticket[];
  ticketsById: Record<string, Ticket>;
  orders: Order[];
  clients: Record<string, Client>;
  settings: Settings;
  syncState: SyncState;
  curClient: string;
  setCurClient(shop: string): void;
  nameOf(id: string | undefined): string;
  clientName(shop: string | undefined): string;
  inClient(x: { client?: string }): boolean;
  slaFor(t: Ticket): SlaLimits;
  /** Latest copy of a ticket, safe to call after awaits. */
  getTicket(id: string): Ticket | undefined;
  saveTicket(t: Ticket): Promise<void>;
  deleteTicket(id: string): Promise<void>;
  saveOrders(orders: Order[]): Promise<void>;
  saveClients(clients: Client[]): Promise<void>;
  saveSettings(patch: Partial<Settings>): Promise<void>;
  saveMyName(name: string): Promise<void>;
  /** Copy order data onto matching tickets and save them. Returns how many tickets changed. */
  applyOrdersToTickets(orders: Order[]): Promise<number>;
}

const Ctx = createContext<DataContext | null>(null);

export function useData(): DataContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData must be used inside <DataProvider>");
  return v;
}

type ById<T> = Record<string, T>;

const toById = <T,>(rows: DocRow<T>[]): ById<T> => Object.fromEntries(rows.map((r) => [r.id, r.data]));

interface ChangePayload {
  eventType: string;
  new: unknown;
  old: unknown;
}

function applyChange<T>(set: Dispatch<SetStateAction<ById<T>>>, p: ChangePayload) {
  set((prev) => {
    const next = { ...prev };
    if (p.eventType === "DELETE") {
      const id = (p.old as { id?: string } | null)?.id;
      if (id) delete next[id];
    } else {
      const row = p.new as DocRow<T> | null;
      if (row?.id) next[row.id] = row.data;
    }
    return next;
  });
}

const CLIENT_KEY = "csdClient";

export function DataProvider({ children }: { children: ReactNode }) {
  const sb = getBrowserSupabase();
  const { toast } = useUi();

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [ticketsById, setTicketsById] = useState<ById<Ticket>>({});
  const [ordersById, setOrdersById] = useState<ById<Order>>({});
  const [clientsById, setClientsById] = useState<ById<Client>>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [syncState, setSyncState] = useState<SyncState>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [curClient, setCurClientState] = useState("");

  useEffect(() => {
    try {
      setCurClientState(localStorage.getItem(CLIENT_KEY) || "");
    } catch {}
  }, []);

  const setCurClient = useCallback((shop: string) => {
    setCurClientState(shop);
    try {
      localStorage.setItem(CLIENT_KEY, shop);
    } catch {}
  }, []);

  const applyConfig = useCallback((id: string, data: unknown) => {
    if (id === "settings" && data) setSettings({ ...DEFAULT_SETTINGS, ...(data as Partial<Settings>) });
    if (id === "sync_gmail") setSyncState((data as SyncState) ?? {});
  }, []);

  // Initial load + live updates.
  useEffect(() => {
    let cancelled = false;
    const slow = setTimeout(() => !cancelled && setLoadError("Tải dữ liệu chậm hơn bình thường…"), 10_000);

    (async () => {
      try {
        const {
          data: { user },
        } = await sb.auth.getUser();
        if (!user) throw new Error("Chưa đăng nhập");

        const { data: member } = await sb.rpc("is_team_member");
        if (member !== true) throw new Error(`Tài khoản ${user.email} chưa được thêm vào đội. Nhờ quản trị viên thêm email vào bảng team_members.`);

        const [tickets, orders, clients, config, profiles] = await Promise.all([
          fetchAllDocs<Ticket>(sb, "tickets"),
          fetchAllDocs<Order>(sb, "orders"),
          fetchAllDocs<Client>(sb, "clients"),
          fetchAllDocs<unknown>(sb, "app_config"),
          sb.from("profiles").select("id,name"),
        ]);
        if (cancelled) return;

        const nameMap: Record<string, string> = {};
        for (const p of (profiles.data ?? []) as { id: string; name: string }[]) nameMap[p.id] = p.name;
        let myName = nameMap[user.id];
        if (!myName) {
          myName = (user.user_metadata?.full_name as string) || (user.email ?? "").split("@")[0] || "Tôi";
          await sb.from("profiles").upsert({ id: user.id, name: myName });
          nameMap[user.id] = myName;
        }

        setMe({ id: user.id, email: user.email ?? "", name: myName });
        setNames(nameMap);
        setTicketsById(toById(tickets));
        setOrdersById(toById(orders));
        setClientsById(toById(clients));
        for (const c of config) applyConfig(c.id, c.data);
        setLoadError("");
        setReady(true);
      } catch (e) {
        if (!cancelled) setLoadError("Lỗi tải dữ liệu: " + (e instanceof Error ? e.message : String(e)));
      } finally {
        clearTimeout(slow);
      }
    })();

    const channel = sb
      .channel("cs-ticket-db")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, (p) => applyChange(setTicketsById, p))
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (p) => applyChange(setOrdersById, p))
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, (p) => applyChange(setClientsById, p))
      .on("postgres_changes", { event: "*", schema: "public", table: "app_config" }, (p) => {
        const row = p.new as DocRow<unknown> | null;
        if (row?.id) applyConfig(row.id, row.data);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (p) => {
        const row = p.new as { id?: string; name?: string } | null;
        if (row?.id) setNames((n) => ({ ...n, [row.id!]: row.name ?? "" }));
      })
      .subscribe();

    return () => {
      cancelled = true;
      clearTimeout(slow);
      sb.removeChannel(channel);
    };
  }, [sb, applyConfig]);

  const tickets = useMemo(() => Object.values(ticketsById), [ticketsById]);
  const orders = useMemo(() => Object.values(ordersById), [ordersById]);
  const clients = useMemo(() => {
    const out: Record<string, Client> = {};
    for (const c of Object.values(clientsById)) if (c?.shop) out[c.shop] = c;
    return out;
  }, [clientsById]);

  // Keep the selected client valid once clients are known.
  useEffect(() => {
    if (ready && curClient && !clients[curClient]) setCurClient("");
  }, [ready, curClient, clients, setCurClient]);

  const nameOf = useCallback(
    (id: string | undefined) => (id ? names[id] || (id === me?.id ? "Tôi" : "Nhân viên") : ""),
    [names, me],
  );
  const clientName = useCallback(
    (shop: string | undefined) => (shop ? clients[shop]?.name || shopShortName(shop) : ""),
    [clients],
  );
  const inClient = useCallback((x: { client?: string }) => !curClient || (x.client || "") === curClient, [curClient]);
  const slaFor = useCallback((t: Ticket) => slaForTicket(t, clients, settings), [clients, settings]);

  // Latest tickets for async actions that run after several awaits.
  const ticketsRef = useRef(ticketsById);
  ticketsRef.current = ticketsById;
  const getTicket = useCallback((id: string) => ticketsRef.current[id], []);

  const saveTicket = useCallback(
    async (t: Ticket) => {
      const x = { ...t, updatedAt: now() };
      ticketsRef.current = { ...ticketsRef.current, [x.id]: x };
      setTicketsById((prev) => ({ ...prev, [x.id]: x }));
      try {
        await upsertDocs(sb, "tickets", [{ id: x.id, data: x }]);
      } catch (e) {
        toast("Không lưu được: " + (e instanceof Error ? e.message : "lỗi"));
      }
    },
    [sb, toast],
  );

  const deleteTicket = useCallback(
    async (id: string) => {
      setTicketsById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      const { error } = await sb.from("tickets").delete().eq("id", id);
      if (error) toast("Không xoá được");
    },
    [sb, toast],
  );

  const saveOrders = useCallback(
    async (list: Order[]) => {
      const rows = list.map((o) => ({ id: orderDocId(o.client, o.orderName), data: o }));
      setOrdersById((prev) => ({ ...prev, ...toById(rows) }));
      await upsertDocs(sb, "orders", rows);
    },
    [sb],
  );

  const saveClients = useCallback(
    async (list: Client[]) => {
      const rows = list.map((c) => ({ id: clientDocId(c.shop), data: c }));
      setClientsById((prev) => ({ ...prev, ...toById(rows) }));
      try {
        await upsertDocs(sb, "clients", rows);
      } catch {
        toast("Không lưu được client");
      }
    },
    [sb, toast],
  );

  const saveSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      const { error } = await sb.from("app_config").upsert({ id: "settings", data: next, updated_at: now() });
      toast(error ? "Không lưu được cài đặt" : "Đã lưu cài đặt");
    },
    [sb, settings, toast],
  );

  const saveMyName = useCallback(
    async (name: string) => {
      if (!me) return;
      const { error } = await sb.from("profiles").upsert({ id: me.id, name, updated_at: now() });
      if (error) return toast("Không lưu được tên");
      setMe({ ...me, name });
      setNames((n) => ({ ...n, [me.id]: name }));
      toast("Đã lưu tên hiển thị");
    },
    [sb, me, toast],
  );

  const applyOrdersToTickets = useCallback(
    async (list: Order[]) => {
      const by = me?.id ?? "";
      const changed = new Map<string, Ticket>();
      for (const o of list) {
        for (const t0 of Object.values(ticketsRef.current)) {
          const t = changed.get(t0.id) ?? t0;
          const x = applyOrderToTicket(t, o, by);
          if (x) changed.set(x.id, x);
        }
      }
      for (const x of changed.values()) await saveTicket(x);
      return changed.size;
    },
    [me, saveTicket],
  );

  const value: DataContext = {
    ready,
    loadError,
    me,
    tickets,
    ticketsById,
    orders,
    clients,
    settings,
    syncState,
    curClient,
    setCurClient,
    nameOf,
    clientName,
    inClient,
    slaFor,
    getTicket,
    saveTicket,
    deleteTicket,
    saveOrders,
    saveClients,
    saveSettings,
    saveMyName,
    applyOrdersToTickets,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
