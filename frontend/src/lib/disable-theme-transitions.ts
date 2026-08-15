/** Temporarily disable CSS transitions during theme switch (instant repaint). */
export function withoutThemeTransitions(action: () => void) {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none!important;animation:none!important}"
    )
  );
  document.head.appendChild(style);

  action();

  // Force synchronous style recalc before re-enabling transitions
  void document.documentElement.offsetHeight;

  document.head.removeChild(style);
}
