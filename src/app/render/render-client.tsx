"use client";

import { useEffect, useRef } from "react";

export function RenderClient({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !html) return;

    const shadow = containerRef.current.shadowRoot ?? containerRef.current.attachShadow({ mode: "open" });
    shadow.innerHTML = html;

    const scripts = shadow.querySelectorAll("script");
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) =>
        newScript.setAttribute(attr.name, attr.value)
      );
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });
  }, [html]);

  if (!html) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: "#0a0a0a",
        }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        overflow: "hidden",
        background: "#0a0a0a",
      }}
    />
  );
}
