(function () {
  "use strict";
  var DEPTOS = ["Ahuachapán","Cabañas","Chalatenango","Cuscatlán","La Libertad","La Paz","La Unión","Morazán","San Miguel","San Salvador","San Vicente","Santa Ana","Sonsonate","Usulután"];
  var MIOS_KEY = "perritos-sv-mios";
  var PHOTO_RE = /^https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/public\/fotos\//;
  var PAW = '<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><ellipse cx="32" cy="42" rx="14" ry="11"/><ellipse cx="14" cy="28" rx="6" ry="8"/><ellipse cx="26" cy="15" rx="6" ry="8.5"/><ellipse cx="38" cy="15" rx="6" ry="8.5"/><ellipse cx="50" cy="28" rx="6" ry="8"/></svg>';

  var CFG = window.PERRITOS_CONFIG || {};
  var configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(CFG.SUPABASE_URL || "") && (CFG.SUPABASE_ANON_KEY || "").length > 40;
  var sb = configured && window.supabase ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

  var S = { reports: [], loaded: false, error: false, filter: "activos", depto: "", q: "" };

  function $(s) { return document.querySelector(s); }
  function h(tag, props) {
    var e = document.createElement(tag);
    props = props || {};
    for (var k in props) {
      var v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(c));
    }
    return e;
  }
  function isoDay(offset) {
    var d = new Date(); d.setDate(d.getDate() - offset);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fmtTel(d) { d = d || ""; return d.slice(0, 4) + "-" + d.slice(4); }
  function ago(f) {
    var d = new Date(f + "T00:00:00"), n = new Date(); n.setHours(0, 0, 0, 0);
    var days = Math.round((n - d) / 864e5);
    if (isNaN(days) || days <= 0) return "Hoy";
    if (days === 1) return "Ayer";
    if (days < 30) return "Hace " + days + " días";
    var m = Math.floor(days / 30);
    return "Hace " + m + (m === 1 ? " mes" : " meses");
  }
  function fmtDate(f) {
    try { return new Date(f + "T00:00:00").toLocaleDateString("es-SV", { day: "numeric", month: "short" }); } catch (e) { return f; }
  }
  var toastTimer;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4200);
  }

  /* Códigos secretos: permiten cerrar o borrar tu reporte sin tener cuenta */
  function getMios() { try { return JSON.parse(localStorage.getItem(MIOS_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function setMio(id, code) { var m = getMios(); m[id] = code; try { localStorage.setItem(MIOS_KEY, JSON.stringify(m)); } catch (e) {} }
  function newCode() {
    var abc = "abcdefghjkmnpqrstuvwxyz23456789", a = crypto.getRandomValues(new Uint8Array(12)), out = "";
    for (var i = 0; i < a.length; i++) out += abc[a[i] % abc.length];
    return out;
  }
  function sha256(s) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) {
      return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    });
  }

  var EXAMPLES = [
    { id: "x1", ejemplo: true, tipo: "perdido", estado: "activo", nombre: "Canelo", raza: "Criollo", color: "Café con patas blancas", tamano: "Mediano", sexo: "Macho", depto: "La Libertad", municipio: "Santa Tecla", referencia: "Cerca del parque Daniel Hernández", fecha: isoDay(2), senas: "Collar azul, cola corta. Es amigable y responde a su nombre." },
    { id: "x2", ejemplo: true, tipo: "encontrado", estado: "activo", nombre: "", raza: "Chihuahua", color: "Beige", tamano: "Pequeño", sexo: "Hembra", depto: "Santa Ana", municipio: "Santa Ana centro", referencia: "Frente a un comedor, 2.ª Avenida Norte", fecha: isoDay(1), senas: "Trae un arnés rosado sin placa. Está en buen estado y se dejó cargar." },
    { id: "x3", ejemplo: true, tipo: "perdido", estado: "activo", nombre: "Rocky", raza: "Pastor alemán", color: "Negro y café", tamano: "Grande", sexo: "Macho", depto: "San Miguel", municipio: "San Miguel", referencia: "Colonia Ciudad Jardín", fecha: isoDay(5), senas: "Tiene una cicatriz en la pata trasera izquierda. Se asusta con la pólvora." }
  ];

  /* Datos */
  function load() {
    if (!sb) { S.loaded = true; renderAll(); return Promise.resolve(); }
    return sb.from("reportes_publicos").select("*").order("creado", { ascending: false }).limit(300).then(function (r) {
      if (r.error) { S.error = true; } else { S.error = false; S.reports = r.data || []; }
      S.loaded = true; renderAll();
    }, function () { S.error = true; S.loaded = true; renderAll(); });
  }
  function accion(r, acc) {
    var code = getMios()[r.id];
    if (!code) return Promise.reject(new Error("Este reporte no fue publicado desde este dispositivo."));
    return sha256(code).then(function (hash) {
      return sb.rpc("actualizar_reporte", { p_id: r.id, p_hash: hash, p_accion: acc });
    }).then(function (res) {
      if (res.error || res.data !== true) throw new Error("No se pudo completar la acción.");
      return load();
    });
  }
  function denunciar(r) {
    return sb.from("denuncias").insert({ reporte_id: r.id, motivo: "Contenido falso o inapropiado" }).then(function (res) {
      if (res.error) throw res.error;
      toast("Gracias. Revisaremos este reporte.");
    });
  }

  /* Tarjetas */
  function hasPhoto(r) { return typeof r.foto_url === "string" && PHOTO_RE.test(r.foto_url); }
  function confirmBtn(label, action) {
    var timer, armed = false;
    var b = h("button", { class: "btn small", type: "button", text: label });
    b.addEventListener("click", function () {
      if (!armed) { armed = true; b.textContent = "¿Seguro? Confirmar"; timer = setTimeout(function () { armed = false; b.textContent = label; }, 4000); return; }
      clearTimeout(timer); b.disabled = true;
      action().catch(function (e) { b.disabled = false; armed = false; b.textContent = label; toast(e && e.message ? e.message : "No se pudo completar la acción."); });
    });
    return b;
  }
  function shareText(r) {
    var tipo = r.tipo === "perdido" ? "SE BUSCA" : "PERRITO ENCONTRADO";
    var nom = r.nombre ? r.nombre + " " : "";
    var det = [r.raza, r.color].filter(Boolean).join(", ");
    return tipo + ": " + nom + (det ? "(" + det + ") " : "") + "en " + r.municipio + ", " + r.depto + ". Contacto: " + fmtTel(r.telefono) + " (" + (r.contacto || "") + ")";
  }
  function card(r) {
    var ex = !!r.ejemplo, home = r.estado === "reunido";
    var cls = "flyer " + (home ? "home" : r.tipo === "encontrado" ? "found" : "");
    var title = home ? "Ya está en casa" : r.tipo === "perdido" ? "Se busca" : "Encontrado";
    var ph = h("div", { class: "photo" });
    if (hasPhoto(r)) ph.append(h("img", { src: r.foto_url, alt: "Foto de " + (r.nombre || "un perro") + (r.color ? ", " + r.color : ""), loading: "lazy" }));
    else { var np = h("div", { class: "nophoto" }); np.innerHTML = PAW + "<small>Sin foto</small>"; ph.append(np); }

    var tags = h("div", { class: "tags" });
    [r.raza, r.color, r.tamano, r.sexo].filter(Boolean).forEach(function (t) { tags.append(h("span", { text: t })); });

    var name = r.nombre || (r.tipo === "encontrado" ? "Perrito encontrado" : "Perrito sin nombre");
    var body = h("div", { class: "fbody" },
      h("h3", { text: name }),
      tags.childNodes.length ? tags : null,
      h("div", { class: "where" }, r.municipio + ", " + r.depto, r.referencia ? h("small", { text: r.referencia }) : null),
      h("div", { class: "when", text: (r.tipo === "perdido" ? "Perdido el " : "Visto el ") + fmtDate(r.fecha) + " · " + ago(r.fecha) }),
      r.senas ? h("p", { class: "desc", text: r.senas }) : null
    );

    var acts = h("div", { class: "acts" });
    if (!ex && !home && r.telefono) {
      var msg = "Hola " + (r.contacto || "") + ", vi tu reporte en Perritos Perdidos SV sobre " + (r.nombre || "el perrito") + ".";
      acts.append(h("a", { class: "btn primary small", href: "https://wa.me/503" + r.telefono + "?text=" + encodeURIComponent(msg), target: "_blank", rel: "noopener", text: "Escribir por WhatsApp" }));
      acts.append(h("a", { class: "btn small", href: "https://wa.me/?text=" + encodeURIComponent(shareText(r)), target: "_blank", rel: "noopener", text: "Compartir" }));
      var copy = h("button", { class: "btn small", type: "button", text: fmtTel(r.telefono) });
      copy.addEventListener("click", function () {
        try { navigator.clipboard.writeText(r.telefono).then(function () { toast("Número copiado"); }, function () { toast("Número: " + fmtTel(r.telefono)); }); } catch (e) { toast("Número: " + fmtTel(r.telefono)); }
      });
      acts.append(copy);
    }
    if (!ex && sb) {
      var mine = !!getMios()[r.id];
      if (mine && !home) acts.append(confirmBtn(r.tipo === "perdido" ? "Ya apareció" : "Ya lo recogieron", function () { return accion(r, "reunido"); }));
      if (mine) acts.append(confirmBtn("Eliminar", function () { return accion(r, "eliminar"); }));
      if (!mine) acts.append(confirmBtn("Reportar", function () { return denunciar(r); }));
    }
    if (acts.childNodes.length) body.append(acts);

    var tabs = null;
    if (!home) {
      tabs = h("div", { class: "tabs", "aria-hidden": "true" });
      var label = ex ? "ejemplo" : fmtTel(r.telefono || "00000000");
      for (var i = 0; i < 6; i++) tabs.append(h("span", { text: label }));
    }
    return h("article", { class: cls },
      h("div", { class: "banner" }, h("strong", { text: title }), h("span", { text: ex ? "Ejemplo" : ago(r.fecha) })),
      ph, body, tabs
    );
  }

  /* Pintado */
  function renderNote() {
    var n = $("#note"), msg = "";
    if (!configured) msg = "La página todavía no está conectada a la base de datos. Falta completar config.js (mira la guía README).";
    else if (S.error) msg = "No se pudieron cargar los reportes. Revisa tu conexión e intenta de nuevo.";
    n.textContent = msg; n.hidden = !msg;
  }
  function renderStats() {
    var l = 0, f = 0, hm = 0;
    S.reports.forEach(function (r) { if (r.estado === "reunido") hm++; else if (r.tipo === "perdido") l++; else if (r.tipo === "encontrado") f++; });
    $("#nLost").textContent = l; $("#nFound").textContent = f; $("#nHome").textContent = hm;
  }
  function renderList() {
    var box = $("#list"); box.textContent = "";
    if (!S.loaded) { box.append(h("div", { class: "empty" }, h("p", { text: "Cargando reportes..." }))); return; }
    var real = S.reports;
    if (!real.length) {
      box.append(h("div", { class: "empty" },
        h("h2", { text: "Todavía no hay reportes" }),
        h("p", { text: "Si perdiste o encontraste un perro, publica el primero. Abajo ves cómo se verán los reportes." }),
        h("button", { class: "btn lost", type: "button", text: "Publicar un reporte", onclick: function () { openForm("perdido"); } })
      ));
      box.append(h("p", { class: "label-ex", text: "Ejemplos de muestra" }));
      var g0 = h("div", { class: "grid" }); EXAMPLES.forEach(function (r) { g0.append(card(r)); }); box.append(g0);
      return;
    }
    var q = S.q.trim().toLowerCase();
    var rows = real.filter(function (r) {
      if (S.filter === "reunido") { if (r.estado !== "reunido") return false; }
      else { if (r.estado === "reunido") return false; if (S.filter !== "activos" && r.tipo !== S.filter) return false; }
      if (S.depto && r.depto !== S.depto) return false;
      if (q) { var hay = [r.nombre, r.raza, r.color, r.municipio, r.referencia, r.senas, r.depto].join(" ").toLowerCase(); if (hay.indexOf(q) < 0) return false; }
      return true;
    });
    if (!rows.length) {
      box.append(h("div", { class: "empty" }, h("h2", { text: "Sin resultados" }), h("p", { text: "No hay reportes con esos filtros. Prueba con otro departamento o quita la búsqueda." })));
      return;
    }
    var g = h("div", { class: "grid" }); rows.forEach(function (r) { g.append(card(r)); }); box.append(g);
  }
  function renderAll() { renderNote(); renderStats(); renderList(); }

  /* Filtros */
  DEPTOS.forEach(function (d) { $("#fDepto").append(h("option", { value: d, text: d })); $("#f-depto").append(h("option", { value: d, text: d })); });
  $("#chips").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-f]"); if (!b) return;
    S.filter = b.getAttribute("data-f");
    document.querySelectorAll("#chips .chip").forEach(function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); });
    renderList();
  });
  $("#fDepto").addEventListener("change", function (e) { S.depto = e.target.value; renderList(); });
  $("#fQ").addEventListener("input", function (e) { S.q = e.target.value; renderList(); });

  /* Formulario */
  var dlg = $("#dlg"), photoData = "";
  function setTipo(t) {
    document.querySelectorAll('input[name="tipo"]').forEach(function (r) { r.checked = r.value === t; });
    $("#lblFecha").textContent = t === "perdido" ? "¿Cuándo se perdió?" : "¿Cuándo lo encontraste?";
    $("#hintNombre").textContent = t === "perdido" ? "El nombre ayuda a que responda." : "Solo si trae collar con nombre.";
  }
  function openForm(t) {
    if (!sb) { toast("La página todavía no está conectada a la base de datos."); return; }
    $("#f").reset(); photoData = ""; $("#preview").style.display = "none"; $("#err").textContent = "";
    setTipo(t);
    var today = isoDay(0); $("#f-fecha").value = today; $("#f-fecha").max = today;
    $("#send").disabled = false; $("#send").textContent = "Publicar reporte";
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  $("#openLost").addEventListener("click", function () { openForm("perdido"); });
  $("#openFound").addEventListener("click", function () { openForm("encontrado"); });
  $("#cancel").addEventListener("click", function () { dlg.close(); });
  document.querySelectorAll('input[name="tipo"]').forEach(function (r) { r.addEventListener("change", function () { setTipo(r.value); }); });
  $("#f-tel").addEventListener("input", function (e) {
    var d = e.target.value.replace(/\D/g, "");
    if (d.length > 8 && d.indexOf("503") === 0) d = d.slice(3);
    d = d.slice(0, 8); e.target.value = d.length > 4 ? d.slice(0, 4) + "-" + d.slice(4) : d;
  });

  function toJpeg(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 720, q = 0.72, out = "";
        for (var i = 0; i < 6; i++) {
          var sc = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL("image/jpeg", q);
          if (out.length < 400000) break;
          max *= 0.8; q = Math.max(0.4, q - 0.06);
        }
        URL.revokeObjectURL(url); res(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("img")); };
      img.src = url;
    });
  }
  function dataUrlToBlob(d) {
    var bin = atob(d.split(",")[1]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: "image/jpeg" });
  }
  $("#f-foto").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0]; photoData = ""; $("#preview").style.display = "none";
    if (!file) return;
    toJpeg(file).then(function (d) { photoData = d; var p = $("#preview"); p.src = d; p.style.display = "block"; })
      .catch(function () { $("#err").textContent = "No se pudo leer esa foto. Prueba con otra imagen."; });
  });

  $("#f").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("#err"); err.textContent = "";
    var tipo = document.querySelector('input[name="tipo"]:checked').value;
    var v = function (id) { return $(id).value.trim(); };
    var tel = v("#f-tel").replace(/\D/g, "");
    if (!v("#f-depto")) { err.textContent = "Elige el departamento."; $("#f-depto").focus(); return; }
    if (!v("#f-muni")) { err.textContent = "Escribe el municipio o la colonia."; $("#f-muni").focus(); return; }
    if (!v("#f-fecha")) { err.textContent = "Indica la fecha."; $("#f-fecha").focus(); return; }
    if (!v("#f-contacto")) { err.textContent = "Escribe tu nombre para que te contacten."; $("#f-contacto").focus(); return; }
    if (!/^[2679]\d{7}$/.test(tel)) { err.textContent = "El WhatsApp debe tener 8 dígitos, por ejemplo 7123-4567."; $("#f-tel").focus(); return; }
    if (v("#f-web")) { dlg.close(); toast("Publicado. Gracias por ayudar."); return; } /* trampa para bots */

    var id = crypto.randomUUID(), code = newCode();
    var btn = $("#send"); btn.disabled = true; btn.textContent = "Publicando...";
    var upload = Promise.resolve(null);
    if (photoData) {
      upload = sb.storage.from("fotos").upload(id + ".jpg", dataUrlToBlob(photoData), { contentType: "image/jpeg" }).then(function (r) {
        if (r.error) throw r.error;
        return sb.storage.from("fotos").getPublicUrl(id + ".jpg").data.publicUrl;
      });
    }
    Promise.all([upload, sha256(code)]).then(function (x) {
      return sb.from("reportes").insert({
        id: id, tipo: tipo, nombre: v("#f-nombre"), raza: v("#f-raza"), color: v("#f-color"), tamano: v("#f-tamano"), sexo: v("#f-sexo"),
        depto: v("#f-depto"), municipio: v("#f-muni"), referencia: v("#f-ref"), fecha: v("#f-fecha"), senas: v("#f-senas"),
        foto_url: x[0], contacto: v("#f-contacto"), telefono: tel, codigo_hash: x[1]
      });
    }).then(function (r) {
      if (r.error) throw r.error;
      setMio(id, code); dlg.close(); toast("Publicado. Gracias por ayudar."); return load();
    }).catch(function (er) {
      btn.disabled = false; btn.textContent = "Publicar reporte";
      var m = er && er.message ? String(er.message) : "";
      err.textContent = m.indexOf("Demasiados") >= 0 ? m : "No se pudo publicar. Revisa tu conexión e intenta de nuevo.";
    });
  });

  /* Arranque */
  renderAll();
  load();
  if (sb) setInterval(function () { if (!document.hidden) load(); }, 90000);
})();
