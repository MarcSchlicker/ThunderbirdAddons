"use strict";

const NextcloudCalDav = (() => {
  const DAV = "DAV:", CAL = "urn:ietf:params:xml:ns:caldav";
  const escapeXml = value => String(value).replace(/[<>&"']/g, character => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"})[character]);

  function safeUrl(href, base, relativeTo = null) {
    const server = new URL(base.endsWith("/") ? base : base + "/");
    const url = new URL(String(href), relativeTo || server);
    if (url.protocol !== "https:" || url.origin !== server.origin || url.username || url.password || url.search || url.hash ||
        !url.pathname.startsWith(server.pathname)) throw new Error("CalDAV hat eine unzulässige Serveradresse geliefert.");
    return url.href;
  }

  function responses(xml) {
    if (xml.length > 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Ungültige oder zu große CalDAV-Antwort.");
    const document = new DOMParser().parseFromString(xml, "application/xml");
    if (document.getElementsByTagName("parsererror").length) throw new Error("CalDAV liefert kein gültiges XML.");
    return Array.from(document.getElementsByTagNameNS(DAV, "response")).map(response => {
      const properties = Array.from(response.getElementsByTagNameNS(DAV, "propstat"))
        .filter(node => /\s200(?:\s|$)/.test(node.getElementsByTagNameNS(DAV, "status")[0]?.textContent || ""));
      return {
        href: response.getElementsByTagNameNS(DAV, "href")[0]?.textContent || "",
        property(namespace, name) { return properties.flatMap(node => Array.from(node.getElementsByTagNameNS(namespace, name)))[0]; }
      };
    });
  }

  async function readXml(response) {
    if (!response.body?.getReader) return response.text();
    const reader = response.body.getReader(), chunks = [];
    let size = 0, timer;
    try {
      return await Promise.race([
        (async () => {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 1024 * 1024) throw new Error("Die CalDAV-Antwort ist größer als 1 MiB.");
            chunks.push(part.value);
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
          return new TextDecoder().decode(bytes);
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("CalDAV-Antwort wurde nicht rechtzeitig vollständig übertragen.")), 20000); })
      ]);
    } finally {
      clearTimeout(timer);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  async function propfind(request, url, properties, depth = "0") {
    const response = await request(url, {method:"PROPFIND", headers:{Depth:depth,"Content-Type":"application/xml; charset=utf-8"},
      body:`<d:propfind xmlns:d="DAV:" xmlns:c="${CAL}" xmlns:a="http://apple.com/ns/ical/"><d:prop>${properties}</d:prop></d:propfind>`});
    if (response.status !== 207) throw new Error(`CalDAV-Abfrage fehlgeschlagen (HTTP ${response.status}). Bitte Kalenderfreigabe und App-Passwort prüfen.`);
    return responses(await readXml(response));
  }

  async function discover(base, request) {
    const root = safeUrl("remote.php/dav/", base);
    const principalResponse = await propfind(request, root, "<d:current-user-principal/>");
    const principalHref = principalResponse.map(row => row.property(DAV, "current-user-principal")?.getElementsByTagNameNS(DAV,"href")[0]?.textContent).find(Boolean);
    if (!principalHref) throw new Error("Nextcloud hat keinen CalDAV-Benutzerpfad geliefert.");
    const principal = safeUrl(principalHref, base, root);
    const homes = await propfind(request, principal, "<c:calendar-home-set/>");
    const homeHref = homes.map(row => row.property(CAL,"calendar-home-set")?.getElementsByTagNameNS(DAV,"href")[0]?.textContent).find(Boolean);
    if (!homeHref) throw new Error("Nextcloud hat keinen Kalenderbereich geliefert.");
    const home = safeUrl(homeHref, base, principal).replace(/\/?$/, "/");
    const rows = await propfind(request, home, "<d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/>", "1");
    const calendars = rows.filter(row => row.property(DAV,"resourcetype")?.getElementsByTagNameNS(CAL,"calendar").length)
      .filter(row => {
        const supported = row.property(CAL,"supported-calendar-component-set");
        return !supported || Array.from(supported.getElementsByTagNameNS(CAL,"comp")).some(node => node.getAttribute("name") === "VEVENT");
      }).map(row => {
        const color = row.property("http://apple.com/ns/ical/","calendar-color")?.textContent || "";
        return {url:safeUrl(row.href, base, home), name:(row.property(DAV,"displayname")?.textContent || "Nextcloud-Kalender").slice(0,160),
          color:/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color) ? color.slice(0,7) : "#6558E8"};
      });
    return {home, calendars};
  }

  async function create(base, home, name, color, id, request) {
    const cleanName = String(name || "").trim();
    if (!cleanName || cleanName.length > 160 || !/^#[0-9a-f]{6}$/i.test(color) || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Bitte gültigen Kalendernamen und Farbe angeben.");
    const url = safeUrl(home.replace(/\/?$/, "/") + id + "/", base);
    const result = await request(url, {method:"MKCALENDAR", headers:{"Content-Type":"application/xml; charset=utf-8", "If-None-Match":"*"},
      body:`<c:mkcalendar xmlns:d="DAV:" xmlns:c="${CAL}" xmlns:a="http://apple.com/ns/ical/"><d:set><d:prop><d:displayname>${escapeXml(cleanName)}</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set><a:calendar-color>${color}FF</a:calendar-color></d:prop></d:set></c:mkcalendar>`});
    if (result.status !== 201) throw new Error(`Kalender konnte nicht angelegt werden (HTTP ${result.status}). Kein bestehender Kalender wurde ersetzt.`);
    return {url, name:cleanName, color};
  }

  return {safeUrl, discover, create, responses};
})();
