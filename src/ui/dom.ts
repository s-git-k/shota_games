/**
 * 小さなDOM生成ヘルパー。フレームワークを使わず素のDOM操作で完結させる。
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, className?: string): HTMLButtonElement {
  const b = el("button", className, label);
  b.type = "button";
  return b;
}
