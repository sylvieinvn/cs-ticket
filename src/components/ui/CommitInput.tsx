"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur" | "defaultValue"> & {
  value: string | number;
  /** Called on blur (or Enter) when the text changed. */
  onCommit(value: string): void;
};

/**
 * An input that saves when the user leaves the field, like a native "change" event.
 * While focused it ignores incoming updates so live data doesn't overwrite what is being typed.
 */
export function CommitInput({ value, onCommit, ...rest }: Props) {
  const [v, setV] = useState(String(value ?? ""));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setV(String(value ?? ""));
  }, [value]);

  const commit = () => {
    focused.current = false;
    if (v !== String(value ?? "")) onCommit(v);
  };

  return (
    <input
      {...rest}
      value={v}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
