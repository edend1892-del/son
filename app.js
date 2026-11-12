(function () {
  "use strict";

  var DATA = window.BENCH_DATA;
  var M = DATA.models;
  var state = { category: "all", sort: "source" };

  // ---------- Formatage ----------
  var nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function pct(v) { return nf1.format(v) + " %"; }
  function signed(v, fmt) { return (v > 0 ? "+" : v < 0 ? "−" : "") + fmt.format(Math.abs(v)); }
  function pts(v) { return signed(v, nf1) + " pt" + (Math.abs(v) >= 2 ? "s" : ""); }
  function usd(v) { return (Number.isInteger(v) ? nf0.format(v) : nf2.format(v)) + " $"; }
  function score(b, key) { return b.unit === "elo" ? nf0.format(b[key]) + " Elo" : pct(b[key]); }
  function gapText(b) {
    var d = b.fable - b.opus;
    return b.unit === "elo" ? signed(d, nf0) + " Elo" : pts(d);
  }

  // ---------- DOM ----------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "style") node.setAttribute("style", attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function $(id) { return document.getElementById(id); }

  // ---------- Infobulle ----------
  var tip = $("tooltip");

  function fillTip(content) {
    clear(tip);
    tip.appendChild(el("div", { class: "tooltip-title", text: content.title }));
    content.rows.forEach(function (r) {
      tip.appendChild(el("div", { class: "tooltip-row" }, [
        el("span", { class: "tooltip-key " + r.cls }),
        el("span", { class: "tooltip-value", text: r.value }),
        el("span", { class: "tooltip-name", text: r.name }),
      ]));
    });
    if (content.foot) tip.appendChild(el("div", { class: "tooltip-foot", text: content.foot }));
  }
  function placeTip(x, y) {
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight, pad = 8;
    var left = x + 14, top = y + 14;
    if (left + w > window.innerWidth - pad) left = x - w - 14;
    if (top + h > window.innerHeight - pad) top = y - h - 14;
    tip.style.left = Math.max(pad, left) + "px";
    tip.style.top = Math.max(pad, top) + "px";
  }
  function hideTip() { tip.hidden = true; }

  function attachTip(node, getContent) {
    node.addEventListener("pointermove", function (e) {
      fillTip(getContent());
      placeTip(e.clientX, e.clientY);
    });
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("focus", function () {
      fillTip(getContent());
      var r = node.getBoundingClientRect();
      placeTip(r.left + Math.min(r.width / 2, 260), r.top + r.height / 2);
    });
    node.addEventListener("blur", hideTip);
  }
  window.addEventListener("scroll", hideTip, { passive: true });

  // ---------- Sélection des données ----------
  function selected() {
    var list = DATA.benchmarks.filter(function (b) {
      return state.category === "all" || b.category === state.category;
    });
    return list;
  }
  function sorted(list) {
    var out = list.slice();
    if (state.sort === "gap") out.sort(function (a, b) { return (b.fable - b.opus) - (a.fable - a.opus); });
    if (state.sort === "fable") out.sort(function (a, b) { return b.fable - a.fable; });
    if (state.sort === "opus") out.sort(function (a, b) { return b.opus - a.opus; });
    return out;
  }
  function isPct(b) { return b.unit === "pct"; }

  // ---------- Chiffres clés (toutes catégories) ----------
  function renderKpis() {
    var all = DATA.benchmarks;
    var pctList = all.filter(isPct);
    var wins = all.filter(function (b) { return b.fable > b.opus; }).length;
    var meanGap = pctList.reduce(function (s, b) { return s + (b.fable - b.opus); }, 0) / pctList.length;
    var top = pctList.slice().sort(function (a, b) { return (b.fable - b.opus) - (a.fable - a.opus); })[0];
    var out = DATA.pricing.filter(function (p) { return p.id === "output"; })[0];

    var tiles = [
      { label: "Benchmarks remportés par Fable 5.2", value: String(wins), unit: " sur " + all.length,
        detail: "Opus 5.5 devance sur AA-Briefcase (Elo)" },
      { label: "Avance moyenne de Fable 5.2", value: signed(meanGap, nf1), unit: " pts",
        detail: "Sur les " + pctList.length + " benchmarks notés en %" },
      { label: "Plus grand écart", value: signed(top.fable - top.opus, nf1), unit: " pts",
        detail: top.name + " : " + pct(top.fable) + " contre " + pct(top.opus) },
      { label: "Prix de sortie d'Opus 5.5", value: usd(out.opus), unit: "",
        detail: "Par million de tokens, contre " + usd(out.fable) + " pour Fable 5.2" },
    ];

    var root = $("kpis");
    clear(root);
    tiles.forEach(function (t) {
      root.appendChild(el("div", { class: "kpi" }, [
        el("div", { class: "kpi-label", text: t.label }),
        el("div", { class: "kpi-value" }, [t.value, el("small", { text: t.unit })]),
        el("div", { class: "kpi-detail", text: t.detail }),
      ]));
    });
  }

  // ---------- Barres horizontales ----------
  // rows : [{ name, sub, bars: [{ cls, value, text }], aria, tip }]
  function hbar(rows, opts) {
    var root = el("div", {
      class: "hbar" + (opts.single ? " hbar-single" : ""),
      style: "--ticks:" + (opts.ticks.length - 1),
      role: "list",
    });
    rows.forEach(function (r) {
      var track = el("div", { class: "hbar-track" }, r.bars.map(function (b) {
        return el("div", { class: "hbar-line" }, [
          el("span", { class: "hbar-bar " + b.cls, style: "width:" + (Math.max(0, b.value) / opts.max * 100) + "%" }),
          el("span", { class: "hbar-val", text: b.text }),
        ]);
      }));
      var row = el("div", { class: "hbar-row", role: "listitem", tabindex: "0", "aria-label": r.aria }, [
        el("div", { class: "hbar-label" }, [
          el("span", { class: "hbar-name", text: r.name }),
          el("span", { class: "hbar-cat", text: r.sub }),
        ]),
        el("div", { class: "hbar-plot" }, [track]),
      ]);
      attachTip(row, function () { return r.tip; });
      root.appendChild(row);
    });
    var axisTrack = el("div", { class: "hbar-track" }, opts.ticks.map(function (t) {
      return el("span", { class: "hbar-tick", style: "left:" + (t / opts.max * 100) + "%", text: opts.tickFmt(t) });
    }));
    root.appendChild(el("div", { class: "hbar-row hbar-axis", "aria-hidden": "true" }, [
      el("div", { class: "hbar-label" }),
      el("div", { class: "hbar-plot" }, [axisTrack]),
    ]));
    return root;
  }

  function benchTip(b) {
    var d = b.fable - b.opus;
    var lead = d === 0 ? "Égalité" :
      "Écart : " + gapText(b).replace(/^[+−]/, "") + " en faveur de " + (d > 0 ? M.fable.short : M.opus.short);
    return {
      title: b.name,
      rows: [
        { cls: "s1", value: score(b, "fable"), name: M.fable.short },
        { cls: "s2", value: score(b, "opus"), name: M.opus.short },
      ],
      foot: lead + (b.note ? ". " + b.note : "."),
    };
  }

  // ---------- Tableaux ----------
  function modelTh(key) {
    return el("th", { class: "num", scope: "col" }, [
      el("span", { class: "th-key" }, [el("span", { class: "swatch " + (key === "fable" ? "s1" : "s2") }), M[key].short]),
    ]);
  }
  function table(headCells, bodyRows) {
    return el("table", null, [
      el("thead", null, [el("tr", null, headCells)]),
      el("tbody", null, bodyRows),
    ]);
  }
  function benchTable(list, withNotes) {
    var head = [
      el("th", { scope: "col", text: "Benchmark" }),
      el("th", { scope: "col", text: "Catégorie" }),
      modelTh("fable"), modelTh("opus"),
      el("th", { class: "num", scope: "col", text: "Écart" }),
    ];
    if (withNotes) head.push(el("th", { scope: "col", text: "Précision" }));
    var rows = list.map(function (b) {
      var cells = [
        el("th", { scope: "row", text: b.name }),
        el("td", { text: DATA.categories[b.category] }),
        el("td", { class: "num", text: score(b, "fable") }),
        el("td", { class: "num", text: score(b, "opus") }),
        el("td", { class: "num", text: gapText(b) }),
      ];
      if (withNotes) cells.push(el("td", { class: "note", text: b.note || "" }));
      return el("tr", null, cells);
    });
    return table(head, rows);
  }

  // ---------- Graphiques de benchmarks (filtrés) ----------
  function renderScores() {
    var list = sorted(selected());
    var pctList = list.filter(isPct);
    var chart = $("scores-chart");
    clear(chart);

    $("scores-sub").textContent = pctList.length + " benchmark" + (pctList.length > 1 ? "s" : "") +
      (state.category === "all" ? ", toutes catégories" : " · " + DATA.categories[state.category]);

    if (!pctList.length) {
      chart.appendChild(el("p", { class: "empty", text: "Aucun benchmark dans cette sélection." }));
    } else {
      chart.appendChild(hbar(pctList.map(function (b) {
        return {
          name: b.name,
          sub: DATA.categories[b.category],
          bars: [
            { cls: "s1", value: b.fable, text: pct(b.fable) },
            { cls: "s2", value: b.opus, text: pct(b.opus) },
          ],
          aria: b.name + " : " + M.fable.short + " " + pct(b.fable) + ", " + M.opus.short + " " + pct(b.opus),
          tip: benchTip(b),
        };
      }), { max: 100, ticks: [0, 25, 50, 75, 100], tickFmt: function (t) { return t + " %"; } }));
    }

    var tableRoot = $("scores-table");
    clear(tableRoot);
    tableRoot.appendChild(benchTable(list, true));

    // Le classement Elo n'est pas sur l'axe en % : il est donné en clair sous le graphique.
    var note = $("elo-note");
    clear(note);
    var elo = list.filter(function (b) { return b.unit === "elo"; })[0];
    note.hidden = !elo;
    if (elo) {
      note.appendChild(el("strong", { text: elo.name + " : " }));
      note.appendChild(document.createTextNode(
        M.opus.short + " " + nf0.format(elo.opus) + ", " + M.fable.short + " " + nf0.format(elo.fable) +
        ". C'est le seul benchmark où " + M.opus.short + " devance, de " + nf0.format(elo.opus - elo.fable) +
        " points Elo. Ce classement n'est pas exprimé en %, il n'apparaît donc pas dans les barres."
      ));
    }
  }

  function renderGap() {
    var list = selected().filter(isPct).sort(function (a, b) { return (b.fable - b.opus) - (a.fable - a.opus); });
    var chart = $("gap-chart");
    clear(chart);
    if (!list.length) {
      chart.appendChild(el("p", { class: "empty", text: "Aucun benchmark dans cette sélection." }));
    } else {
      chart.appendChild(hbar(list.map(function (b) {
        var d = b.fable - b.opus;
        return {
          name: b.name,
          sub: DATA.categories[b.category],
          bars: [{ cls: d >= 0 ? "s1" : "s2", value: Math.abs(d), text: pts(d) }],
          aria: b.name + " : écart de " + pts(d),
          tip: benchTip(b),
        };
      }), { single: true, max: 30, ticks: [0, 10, 20, 30], tickFmt: function (t) { return t + " pts"; } }));
    }
    var tableRoot = $("gap-table");
    clear(tableRoot);
    tableRoot.appendChild(benchTable(list, false));
  }

  // ---------- Prix ----------
  function renderPrice() {
    var max = 80, ticks = [0, 20, 40, 60, 80];
    var plot = el("div", { class: "col-plot" });
    ticks.slice(1).forEach(function (t) {
      plot.appendChild(el("div", { class: "col-gridline", style: "bottom:" + (t / max * 100) + "%" }));
    });
    DATA.pricing.forEach(function (p) {
      var group = el("div", {
        class: "col-group", tabindex: "0",
        "aria-label": p.label + " : " + M.fable.short + " " + usd(p.fable) + ", " + M.opus.short + " " + usd(p.opus),
      }, ["fable", "opus"].map(function (k) {
        return el("div", { class: "col " + (k === "fable" ? "s1" : "s2"), style: "height:" + (p[k] / max * 100) + "%" }, [
          el("span", { class: "col-cap", text: usd(p[k]) }),
        ]);
      }));
      attachTip(group, function () {
        return {
          title: p.label,
          rows: [
            { cls: "s1", value: usd(p.fable), name: M.fable.short },
            { cls: "s2", value: usd(p.opus), name: M.opus.short },
          ],
          foot: "Par million de tokens.",
        };
      });
      plot.appendChild(group);
    });

    var yaxis = el("div", { class: "col-yaxis", "aria-hidden": "true" }, ticks.map(function (t) {
      return el("span", { style: "bottom:" + (t / max * 100) + "%", text: usd(t) });
    }));
    var xaxis = el("div", { class: "col-xaxis" }, DATA.pricing.map(function (p) {
      return el("span", { text: p.label });
    }));

    var chart = $("price-chart");
    clear(chart);
    chart.appendChild(el("div", { class: "col-chart" }, [yaxis, plot, xaxis]));

    var rows = DATA.pricing.map(function (p) {
      return el("tr", null, [
        el("th", { scope: "row", text: p.label }),
        el("td", { class: "num", text: usd(p.fable) }),
        el("td", { class: "num", text: usd(p.opus) }),
      ]);
    });
    rows.push(el("tr", null, [
      el("th", { scope: "row", text: "Lecture de cache" }),
      el("td", { class: "num", text: usd(DATA.cacheRead.fable) }),
      el("td", { class: "num", text: usd(DATA.cacheRead.opus) }),
    ]));
    var tableRoot = $("price-table");
    clear(tableRoot);
    tableRoot.appendChild(table([el("th", { scope: "col", text: "Par million de tokens" }), modelTh("fable"), modelTh("opus")], rows));
  }

  // ---------- Simulateur ----------
  function price(id, key) {
    return DATA.pricing.filter(function (p) { return p.id === id; })[0][key];
  }
  function readNumber(id) {
    var v = parseFloat($(id).value);
    return isFinite(v) && v > 0 ? v : 0;
  }
  function renderCalc() {
    var input = readNumber("calc-input"), cache = readNumber("calc-cache"), output = readNumber("calc-output");
    var cost = {};
    ["fable", "opus"].forEach(function (k) {
      cost[k] = input * price("input", k) + cache * DATA.cacheRead[k] + output * price("output", k);
    });
    var max = Math.max(cost.fable, cost.opus);
    var root = $("calc-result");
    clear(root);
    ["fable", "opus"].forEach(function (k) {
      root.appendChild(el("div", { class: "calc-row" }, [
        el("div", { class: "calc-row-head" }, [
          el("span", null, [el("span", { class: "swatch " + (k === "fable" ? "s1" : "s2") }), M[k].name]),
          el("span", { class: "calc-cost", text: nf0.format(Math.round(cost[k])) + " $" }),
        ]),
        el("div", { class: "calc-track" }, [
          el("div", { class: "calc-fill " + (k === "fable" ? "s1" : "s2"), style: "width:" + (max ? cost[k] / max * 100 : 0) + "%" }),
        ]),
      ]));
    });
    var summary = el("p", { class: "calc-summary" });
    if (cost.opus > 0) {
      summary.appendChild(el("strong", { text: "Fable 5.2 coûte " + nf0.format(Math.round(cost.fable - cost.opus)) + " $ de plus par mois" }));
      summary.appendChild(document.createTextNode(
        ", soit " + nf2.format(cost.fable / cost.opus) + " fois le coût d'Opus 5.5. " +
        "Plus la part de lectures de cache est élevée, plus l'écart se resserre, car ce tarif est identique."
      ));
    } else {
      summary.textContent = "Saisissez un volume de tokens pour comparer les coûts.";
    }
    root.appendChild(summary);
  }

  // ---------- Fiche technique ----------
  function renderSpecs() {
    var rows = DATA.specs.map(function (s) {
      var cls = s.mono ? "mono" : "";
      return el("tr", null, [
        el("th", { scope: "row", text: s.label }),
        el("td", { class: cls, text: s.fable }),
        el("td", { class: cls, text: s.opus }),
      ]);
    });
    var head = [
      el("th", { scope: "col", text: "Caractéristique" }),
      el("th", { scope: "col" }, [el("span", { class: "th-key" }, [el("span", { class: "swatch s1" }), M.fable.name])]),
      el("th", { scope: "col" }, [el("span", { class: "th-key" }, [el("span", { class: "swatch s2" }), M.opus.name])]),
    ];
    var root = $("specs-table");
    clear(root);
    root.appendChild(table(head, rows));
  }

  // ---------- Contrôles ----------
  function renderFilters() {
    var root = $("category-filter");
    clear(root);
    var options = [["all", "Tous"]].concat(Object.keys(DATA.categories).map(function (k) {
      return [k, DATA.categories[k]];
    }));
    options.forEach(function (o) {
      var btn = el("button", { type: "button", "aria-pressed": String(state.category === o[0]), text: o[1] });
      btn.addEventListener("click", function () {
        state.category = o[0];
        renderFilters();
        renderScores();
        renderGap();
      });
      root.appendChild(btn);
    });
  }

  function initTableToggles() {
    Array.prototype.forEach.call(document.querySelectorAll(".table-toggle"), function (btn) {
      btn.addEventListener("click", function () {
        var name = btn.getAttribute("data-target");
        var showTable = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", String(showTable));
        btn.textContent = showTable ? "Graphique" : "Tableau";
        $(name + "-chart").hidden = showTable;
        $(name + "-table").hidden = !showTable;
        var legend = btn.closest(".card").querySelector(".legend");
        if (legend) legend.hidden = showTable;
      });
    });
  }

  function initTheme() {
    var btn = $("theme-toggle");
    var root = document.documentElement;
    var stored = null;
    try { stored = localStorage.getItem("theme"); } catch (e) { /* stockage indisponible */ }
    if (stored === "dark" || stored === "light") root.setAttribute("data-theme", stored);

    function current() {
      var set = root.getAttribute("data-theme");
      if (set) return set;
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    function label() { btn.textContent = current() === "dark" ? "Thème clair" : "Thème sombre"; }
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* stockage indisponible */ }
      label();
    });
    label();
  }

  function init() {
    $("updated").textContent = new Date(DATA.updated + "T00:00:00").toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric",
    });
    initTheme();
    initTableToggles();
    renderKpis();
    renderFilters();
    renderScores();
    renderGap();
    renderPrice();
    renderSpecs();
    renderCalc();

    $("sort-select").addEventListener("change", function (e) {
      state.sort = e.target.value;
      renderScores();
    });
    ["calc-input", "calc-cache", "calc-output"].forEach(function (id) {
      $(id).addEventListener("input", renderCalc);
    });
  }

  init();
})();
