(function() {
  const STORAGE_PREFIX = "passage-highlight:";
  const COLORS = [
    { key: "yellow", label: "Yellow", cls: "passage-highlight-yellow" },
    { key: "green", label: "Green", cls: "passage-highlight-green" },
    { key: "blue", label: "Blue", cls: "passage-highlight-blue" },
    { key: "pink", label: "Pink", cls: "passage-highlight-pink" }
  ];

  const saveState = (el) => {
    const key = STORAGE_PREFIX + window.location.pathname;
    localStorage.setItem(key, el.innerHTML);
  };

  const loadState = (el) => {
    const key = STORAGE_PREFIX + window.location.pathname;
    const saved = localStorage.getItem(key);
    if (saved) el.innerHTML = saved;
  };

  const clearAllHighlights = (root) => {
    root.querySelectorAll("[data-highlight]").forEach(span => {
      span.replaceWith(...span.childNodes);
    });
    saveState(root);
  };

  const removeHighlightAtSelection = (sel, root) => {
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    let node = range.commonAncestorContainer;
    while (node && node !== root) {
      if (node.nodeType === 1 && node.hasAttribute("data-highlight")) {
        node.replaceWith(...node.childNodes);
        saveState(root);
        return;
      }
      node = node.parentNode;
    }
  };

  const applyHighlight = (sel, root, cls) => {
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed || !root.contains(range.commonAncestorContainer)) return;

    const fragment = range.cloneContents();
    fragment.querySelectorAll("[data-highlight]").forEach(span => {
      span.replaceWith(...span.childNodes);
    });
    range.deleteContents();

    const span = document.createElement("span");
    span.className = cls;
    span.setAttribute("data-highlight", cls);
    span.appendChild(fragment);
    range.insertNode(span);
    sel.removeAllRanges();
    saveState(root);
  };

  const createMenu = (root, sel) => {
    const menu = document.createElement("div");
    menu.className = "passage-menu";

    COLORS.forEach(c => {
      const btn = document.createElement("button");
      btn.type = "button";
      const swatch = document.createElement("span");
      swatch.className = `passage-color-swatch ${c.cls}`;
      btn.appendChild(swatch);
      btn.appendChild(document.createTextNode(c.label));
      btn.addEventListener("click", () => {
        applyHighlight(sel, root, c.cls);
        menu.remove();
      });
      menu.appendChild(btn);
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove highlight";
    removeBtn.addEventListener("click", () => {
      removeHighlightAtSelection(sel, root);
      menu.remove();
    });
    menu.appendChild(removeBtn);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear all";
    clearBtn.addEventListener("click", () => {
      clearAllHighlights(root);
      menu.remove();
    });
    menu.appendChild(clearBtn);

    return menu;
  };

  const hideMenu = () => {
    document.querySelectorAll(".passage-menu").forEach(m => m.remove());
  };

  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("passage-content");
    if (!root) return;

    loadState(root);

    document.addEventListener("click", () => hideMenu());
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
      }
      if (e.key === "Escape") hideMenu();
    });

    root.addEventListener("contextmenu", (e) => {
      const sel = window.getSelection();
      const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      const hasSelection = !!(range && !range.collapsed && root.contains(range.commonAncestorContainer));
      e.preventDefault();
      e.stopPropagation();
      hideMenu();
      if (!hasSelection) return;
      const menu = createMenu(root, sel);
      document.body.appendChild(menu);
      const rect = menu.getBoundingClientRect();
      const x = Math.min(e.clientX, window.innerWidth - rect.width - 8);
      const y = Math.min(e.clientY, window.innerHeight - rect.height - 8);
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
    });
  });
})();
