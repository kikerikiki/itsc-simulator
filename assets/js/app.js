/* Prüfungssimulator "IT Source Code"
   Eine Seite, drei Ansichten: Start, Fragebogen, Auswertung.
   Die Fragen stehen in fragen.js, die Hintergrundgrafik in netz.js. */
(function(){
'use strict';

const app = document.getElementById('app');
const SPEICHER = 'itsc-lauf-1';
const BILDPFAD = 'assets/bilder/';
const BILD_ALT = window.BILD_ALT || {};   /* Bildbeschreibungen, siehe fragen.js */
const AB_HIER_LANG = 20;      /* ab so vielen Fragen darf vorzeitig ausgewertet werden */

/* Der laufende Durchgang, Aufbau siehe starte(). */
let lauf = null;


/* ============================ Hilfsmittel ============================ */

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Vergleichsform für Freitext: Kleinbuchstaben, ohne Satzzeichen,
   Bindestriche als Leerzeichen, einfache Abstände. */
const norm = s => String(s || '').toLowerCase()
  .replace(/[-–—_/]/g, ' ')
  .replace(/[.,;:!?"'`()\[\]]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function mische(liste){
  const kopie = liste.slice();
  for(let i = kopie.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

/* Editierabstand, abgebrochen sobald er die Schranke überschreitet. */
function abstand(a, b, schranke){
  if(Math.abs(a.length - b.length) > schranke) return schranke + 1;
  let vorher = Array.from({length: b.length + 1}, (_, i) => i);
  for(let i = 1; i <= a.length; i++){
    const jetzt = [i];
    let kleinstes = i;
    for(let j = 1; j <= b.length; j++){
      const kosten = a[i-1] === b[j-1] ? 0 : 1;
      jetzt[j] = Math.min(vorher[j] + 1, jetzt[j-1] + 1, vorher[j-1] + kosten);
      kleinstes = Math.min(kleinstes, jetzt[j]);
    }
    if(kleinstes > schranke) return schranke + 1;
    vorher = jetzt;
  }
  return vorher[b.length];
}


/* ======================== Fragenbestand prüfen ========================= */
/* Die Fragen dürfen von Hand ergänzt werden. Eine Frage, der ein Feld ihres
   Typs fehlt, würde die Seite mitten im Aufbau abbrechen lassen, deshalb
   wird sie hier aussortiert statt später zum Absturz zu führen. */

function vollstaendig(q){
  if(!q || !q.id || !q.typ || !q.frage || q.loesung === undefined) return false;
  if(q.typ === 'multiple_choice' || q.typ === 'wahr_falsch'){
    return Array.isArray(q.optionen) && q.optionen.length >= 2 && !!q.loesung_key;
  }
  if(q.typ === 'zuordnung'){
    return Array.isArray(q.begriffe) && Array.isArray(q.beschreibungen)
      && q.begriffe.length === q.beschreibungen.length
      && q.loesung_paare && q.begriffe.every(b => q.loesung_paare[b]);
  }
  return q.typ === 'lueckentext' || q.typ === 'kurzantwort';
}

const ROH = Array.isArray(window.FRAGEN) ? window.FRAGEN : [];
const FRAGEN = ROH.filter(vollstaendig);
const AUSSORTIERT = ROH.length - FRAGEN.length;


/* ====================== Mischen von Antworten ====================== */
/* Im Buch stehen die richtigen Antworten auffällig oft an derselben Stelle.
   Deshalb werden Optionen und Beschreibungen je Durchgang neu gemischt und
   neu durchbuchstabiert. Die Mischung wird im Durchgang gemerkt, damit sie
   beim Blättern und nach einer Pause gleich bleibt. */

const KLEIN = 'abcdefgh';
const GROSS = 'ABCDEFGH';

function beschreibungen(q){
  if(!lauf.mixe[q.id]){
    lauf.mixe[q.id] = mische(q.beschreibungen)
      .map((b, i) => ({key: KLEIN[i], orig: b.key, text: b.text}));
  }
  return lauf.mixe[q.id];
}

function optionen(q){
  if(q.typ !== 'multiple_choice') return q.optionen;   /* Wahr/Falsch bleibt fest */
  const schluessel = 'o' + q.id;
  if(!lauf.mixe[schluessel]){
    lauf.mixe[schluessel] = mische(q.optionen)
      .map((o, i) => ({key: GROSS[i], orig: o.key, text: o.text}));
  }
  return lauf.mixe[schluessel];
}

/* Rechnet einen Buchstaben aus den Daten auf den um, der angezeigt wird. */
function zeigeKey(q, origKey){
  const treffer = beschreibungen(q).find(b => b.orig === origKey);
  return treffer ? treffer.key : origKey;
}
function zeigeOptKey(q, origKey){
  if(q.typ !== 'multiple_choice') return origKey;
  const treffer = optionen(q).find(o => o.orig === origKey);
  return treffer ? treffer.key : origKey;
}


/* ============================ Bewertung ============================ */

/* Lückentext: gewertet wird die Lösung selbst, jede hinterlegte Alternative,
   ein Vertipper darin und eine abweichende Endung (Plural statt Singular).
   Steht der Begriff in einem ganzen Satz, zählt das nur bei einer kurzen
   Antwort, sonst wäre "das ist kein Stack" richtig. Ein bloßer Teilstring
   reicht nie, sonst wäre bei der Lösung "RAM" schon ein "a" richtig. */
function lueckeRichtig(q, antwort){
  const a = norm(antwort);
  if(!a) return false;
  const gueltig = [q.loesung].concat(q.alternativen || []).map(norm).filter(Boolean);
  const knapp = a.split(' ').length <= 4;

  return gueltig.some(k => {
    if(a === k) return true;

    const erlaubt = k.length >= 12 ? 2 : 1;          /* längere Begriffe, mehr Vertipper */
    if(k.length >= 5 && abstand(a, k, erlaubt) <= erlaubt) return true;

    const kurz = a.length < k.length ? a : k;        /* Datenbanken statt Datenbank */
    const lang = a.length < k.length ? k : a;
    if(kurz.length >= 4 && lang.length - kurz.length <= 2 && lang.startsWith(kurz)) return true;

    if(!knapp) return false;                         /* ganzer Satz: nicht mehr raten */
    const sicher = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^| )' + sicher + '( |$)').test(a);
  });
}

/* 'richtig', 'falsch' oder 'offen'. Kurzantworten bewertet der Prüfling
   am Ende selbst, bis dahin stehen sie auf 'offen'. */
function stand(q){
  const antwort = lauf.antworten[q.id];
  if(q.typ === 'kurzantwort'){
    if(lauf.selbst[q.id] === undefined) return 'offen';
    return lauf.selbst[q.id] ? 'richtig' : 'falsch';
  }
  if(antwort === undefined || antwort === null || antwort === '') return 'offen';

  switch(q.typ){
    case 'multiple_choice':
    case 'wahr_falsch':
      return antwort === zeigeOptKey(q, q.loesung_key) ? 'richtig' : 'falsch';
    case 'lueckentext':
      return lueckeRichtig(q, antwort) ? 'richtig' : 'falsch';
    case 'zuordnung': {
      const paare = q.loesung_paare;
      const begriffe = Object.keys(paare);
      if(begriffe.some(b => !antwort[b])) return 'offen';
      return begriffe.every(b => antwort[b] === zeigeKey(q, paare[b])) ? 'richtig' : 'falsch';
    }
  }
  return 'offen';
}

/* In der Auswertung zählt alles als falsch, was nicht richtig ist. Offen
   bleiben dort nur noch die Kurzantworten, die niemand bewertet hat. */
function bilanz(){
  let richtig = 0, gewertet = 0, offen = 0;
  lauf.fragen.forEach(q => {
    const s = stand(q);
    if(q.typ === 'kurzantwort' && s === 'offen'){ offen++; return; }
    gewertet++;
    if(s === 'richtig') richtig++;
  });
  return {richtig, gewertet, offen, prozent: gewertet ? Math.round(richtig / gewertet * 100) : 0};
}


/* ====================== Unterbrochener Durchgang ====================== */
/* 500 Fragen schafft niemand in einem Zug, deshalb liegt der Stand im
   Browser des Prüflings. Gespeichert werden nur Kennungen, keine Fragetexte. */

let sicherTimer = null;

function sichern(){
  if(!lauf || lauf.fertig) return;       /* ausgewertet heißt abgeschlossen */
  clearTimeout(sicherTimer);
  sicherTimer = null;
  try{
    localStorage.setItem(SPEICHER, JSON.stringify({
      ids: lauf.fragen.map(q => q.id),
      i: lauf.i,
      antworten: lauf.antworten,
      selbst: lauf.selbst,
      mixe: lauf.mixe,
      frueh: lauf.frueh,
      gesamt: lauf.gesamt,
      stand: Date.now()
    }));
  }catch(e){ /* privater Modus oder voller Speicher: dann eben ohne */ }
}

/* Beim Tippen nicht bei jedem Anschlag den ganzen Durchgang wegschreiben. */
function sichernGleich(){
  clearTimeout(sicherTimer);
  sicherTimer = setTimeout(sichern, 400);
}

function verwerfen(){
  clearTimeout(sicherTimer);
  sicherTimer = null;
  try{ localStorage.removeItem(SPEICHER); }catch(e){}
}

const istObjekt = w => w !== null && typeof w === 'object' && !Array.isArray(w);

function gesichert(){
  let d;
  try{
    const roh = localStorage.getItem(SPEICHER);
    if(!roh) return null;
    d = JSON.parse(roh);
  }catch(e){ return null; }

  if(!istObjekt(d) || !Array.isArray(d.ids) || !Number.isFinite(d.stand)) return null;

  const nach = new Map(FRAGEN.map(q => [q.id, q]));
  const fragen = d.ids.map(id => nach.get(id)).filter(Boolean);
  if(!fragen.length || fragen.length !== d.ids.length) return null;   /* Bestand hat sich geändert */

  return {
    fragen,
    i: Math.min(Math.max(0, d.i | 0), fragen.length - 1),
    antworten: istObjekt(d.antworten) ? d.antworten : {},
    selbst:    istObjekt(d.selbst)    ? d.selbst    : {},
    mixe:      istObjekt(d.mixe)      ? d.mixe      : {},
    frueh:     fragen.length >= AB_HIER_LANG,
    gesamt:    Number.isFinite(d.gesamt) ? d.gesamt : fragen.length,
    stand:     d.stand
  };
}

function standText(zeit){
  const tag = new Date(zeit);
  const heuer = tag.getFullYear() === new Date().getFullYear();
  return tag.toLocaleDateString('de-AT',
    heuer ? {day:'numeric', month:'long'} : {day:'numeric', month:'long', year:'numeric'});
}


/* ============================ Startseite ============================ */

const KOPF = `<div class="kopf wrap"><hr>
  <div class="zeile"><span>Lehrabschlussprüfung</span>
  <span>Applikationsentwicklung – Coding</span></div></div>`;

function kapitelliste(){
  const liste = [];
  FRAGEN.forEach(q => {
    let eintrag = liste.find(k => k.nr === q.kapitel);
    if(!eintrag){ eintrag = {nr: q.kapitel, name: q.kapitel_name, anzahl: 0}; liste.push(eintrag); }
    eintrag.anzahl++;
  });
  return liste.sort((a, b) => a.nr - b.nr);
}

/* Einzige Ansicht ohne Fragenbestand: wenn fragen.js fehlt oder leer ist. */
function zeigeLeer(){
  document.body.classList.remove('imquiz');
  app.innerHTML = `
  <section class="dunkel hero">
    ${KOPF}
    <div class="wrap titelblock">
      <h1 class="titel"><span class="prompt">&gt;</span><span>Prüfungssimulator</span></h1>
      <p class="unter">Keine Fragen geladen</p>
      <div class="strich"></div>
    </div>
  </section>
  <section class="wrap start-unten">
    <p>Die Datei <code>assets/js/fragen.js</code> konnte nicht geladen werden oder
    enthält keine verwertbaren Fragen. Beim Veröffentlichen prüfen, ob der Ordner
    <code>assets</code> vollständig mit hochgeladen wurde.</p>
  </section>`;
}

function zeigeStart(){
  if(!FRAGEN.length) return zeigeLeer();

  document.body.classList.remove('imquiz');
  lauf = null;

  const kapitel = kapitelliste();
  const buchfragen = FRAGEN.filter(q => q.quelle === 'buch');
  const offenerLauf = gesichert();

  const umfaenge = [
    ['buch',    `Die ${buchfragen.length} Buchfragen`,
                'Kompletter Durchgang in Buchreihenfolge'],
    ['alle',    `Extended Version, ${FRAGEN.length} Fragen`,
                `Buchfragen und ${FRAGEN.length - buchfragen.length} zusätzliche, zufällig gemischt`],
    ['zufall',  '20 Fragen, zufällig',
                `Kurzer Check, gezogen aus allen ${FRAGEN.length} Fragen`],
    ['kapitel', 'Ein Kapitel üben',
                `Alle Fragen zu einem der ${kapitel.length} Kapitel`]
  ];

  app.innerHTML = `
  <section class="dunkel hero">
    ${window.netzSVG(820, 460, 20, 7)}
    ${KOPF}
    <div class="wrap titelblock">
      <h1 class="titel"><span class="prompt">&gt;</span><span>Prüfungssimulator</span><span class="cursor"></span></h1>
      <p class="unter">${FRAGEN.length} Fragen zu IT Source Code</p>
      <div class="strich"></div>
    </div>
  </section>

  <section class="wrap start-unten">
    ${offenerLauf ? `<div class="fortsetzen">
      <p>Angefangener Durchgang vom ${standText(offenerLauf.stand)}, stehen geblieben bei
        Frage ${offenerLauf.i + 1} von ${offenerLauf.fragen.length}.</p>
      <button class="geist" id="weiterMachen">Fortsetzen</button>
      <button class="weg" id="verwerfen">Verwerfen</button>
    </div>` : ''}

    <h2 class="marke" id="umfangTitel">Umfang wählen</h2>
    <div class="modi" role="radiogroup" aria-labelledby="umfangTitel" id="modus">
      ${umfaenge.map(([wert, titel, dazu], ix) => `
        <label class="wahl${ix === 0 ? ' an' : ''}">
          <input type="radio" name="umfang" value="${wert}"${ix === 0 ? ' checked' : ''}>
          <span class="key" aria-hidden="true">${ix + 1}</span>
          <span><b>${titel}</b><br><span class="mut">${dazu}</span></span>
        </label>`).join('')}
    </div>

    <div id="kapitelwahl" hidden>
      <label class="marke grau" for="kapSel">Kapitel</label><br>
      <select class="feld" id="kapSel" style="margin-top:8px">
        ${kapitel.map(k => `<option value="${esc(String(k.nr))}">${k.nr}. ${esc(k.name)}</option>`).join('')}
      </select>
    </div>

    <button class="cta" id="los">Prüfung starten</button>
    ${AUSSORTIERT ? `<p class="mut" style="margin-top:20px">Hinweis: ${AUSSORTIERT}
      unvollständige ${AUSSORTIERT === 1 ? 'Frage wurde' : 'Fragen wurden'}
      übersprungen.</p>` : ''}
  </section>`;

  const kapitelwahl = document.getElementById('kapitelwahl');
  const modus = () => app.querySelector('input[name="umfang"]:checked').value;

  document.getElementById('modus').addEventListener('change', () => {
    app.querySelectorAll('#modus .wahl').forEach(feld => {
      feld.classList.toggle('an', feld.querySelector('input').checked);
    });
    kapitelwahl.hidden = (modus() !== 'kapitel');
  });

  document.getElementById('los').addEventListener('click', () => starte(modus()));

  if(offenerLauf){
    document.getElementById('weiterMachen').addEventListener('click', () => {
      lauf = offenerLauf;
      zeigeFrage();
    });
    document.getElementById('verwerfen').addEventListener('click', () => {
      verwerfen();
      zeigeStart();
    });
  }
}

function starte(modus){
  let set;
  if(modus === 'buch')          set = FRAGEN.filter(q => q.quelle === 'buch');
  else if(modus === 'zufall')   set = mische(FRAGEN).slice(0, 20);
  else if(modus === 'kapitel'){
    const feld = document.getElementById('kapSel');
    const nr = feld ? Number(feld.value) : NaN;
    set = FRAGEN.filter(q => q.kapitel === nr);
  }
  else                          set = mische(FRAGEN);

  if(!set.length) return;       /* kommt nur vor, wenn der Bestand leer ist */

  lauf = {
    fragen: set,
    i: 0,
    antworten: {},
    selbst: {},
    mixe: {},
    frueh: set.length >= AB_HIER_LANG,   /* lange Durchgänge vorzeitig auswertbar */
    gesamt: set.length,
    fertig: false
  };
  sichern();
  zeigeFrage();
}


/* ============================ Fragebogen ============================ */

function eingabefeld(q){
  const antwort = lauf.antworten[q.id];

  if(q.typ === 'multiple_choice' || q.typ === 'wahr_falsch'){
    return `<div class="modi" role="radiogroup" aria-labelledby="frageText">`
      + optionen(q).map(o => `
        <label class="wahl${antwort === o.key ? ' an' : ''}">
          <input type="radio" name="antwort" value="${esc(o.key)}"${antwort === o.key ? ' checked' : ''}>
          <span class="key" aria-hidden="true">${esc(o.key)})</span>
          <span>${esc(o.text)}</span>
        </label>`).join('')
      + `</div>`;
  }

  if(q.typ === 'lueckentext'){
    return `<label class="verst" for="inp">Gesuchter Begriff</label>
      <input class="feld" id="inp" type="text" autocomplete="off" autocapitalize="off"
        spellcheck="false" placeholder="Begriff eintragen"
        value="${esc(antwort || '')}" style="margin-top:16px">`;
  }

  if(q.typ === 'kurzantwort'){
    return `<label class="verst" for="inp">Deine Antwort</label>
      <textarea class="feld" id="inp" placeholder="In zwei bis vier Sätzen antworten"
        style="margin-top:16px">${esc(antwort || '')}</textarea>
      <p class="mut" style="margin-top:9px">Kurzantworten bewertest du am Ende selbst,
        mit der Musterlösung daneben.</p>`;
  }

  if(q.typ === 'zuordnung'){
    const gewaehlt = antwort || {};
    const liste = beschreibungen(q);
    /* Je Begriff eine Reihe anzutippender Buchstaben statt einer Auswahlliste:
       am Handy ein Fingertipp statt dreier, und die ganze Zuordnung ist auf
       einen Blick zu sehen. */
    return `<div class="beschr"><span class="marke blau">Beschreibungen</span>
        <ol type="a">${liste.map(b => `<li>${esc(b.text)}</li>`).join('')}</ol></div>
      <div class="zuord">`
      + q.begriffe.map((begriff, ix) => `<div class="paar">
          <b id="zu${ix}">${esc(begriff)}</b>
          <div class="chips" role="radiogroup" aria-labelledby="zu${ix}">
            ${liste.map(b => `<label class="chip${gewaehlt[begriff] === b.key ? ' an' : ''}">
              <input type="radio" name="zu${ix}" value="${esc(b.key)}"
                data-begriff="${esc(begriff)}"${gewaehlt[begriff] === b.key ? ' checked' : ''}>
              <span>${esc(b.key)}</span></label>`).join('')}
          </div></div>`).join('')
      + `</div>`;
  }
  return '';
}

function zeigeFrage(){
  document.body.classList.add('imquiz');
  const {fragen, i, antworten} = lauf;
  const q = fragen[i];
  const herkunft = esc(q.block || q.kapitel_name);

  app.innerHTML = `
  <div class="leiste"><div class="innen">
    <div class="zeile" aria-live="polite"><span>${herkunft}</span>
      <span>Frage ${i+1} / ${fragen.length}</span></div>
    <div class="balken"><i style="width:${i / fragen.length * 100}%"></i></div>
  </div></div>

  <article class="wrap frageblatt">
    <span class="marke">${esc(q.typ_label || '')}</span>
    <h1 class="frage" id="frageText" tabindex="-1">${esc(q.frage)}</h1>
    ${q.bild ? `<figure class="abb">
      <img src="${BILDPFAD}${esc(q.bild)}" alt="${esc(BILD_ALT[q.bild] || ('Abbildung aus dem Kapitel ' + (q.block || q.kapitel_name)))}" loading="lazy">
      <figcaption>Abbildung aus dem Buch</figcaption></figure>` : ''}
    ${eingabefeld(q)}
    ${fragen.length <= 40 ? `<div class="punkte" aria-hidden="true">${fragen.map((f, ix) => {
      const beantwortet = antworten[f.id] !== undefined && antworten[f.id] !== '';
      return `<b class="${ix === i ? 'hier' : (beantwortet ? 'voll' : '')}"></b>`;
    }).join('')}</div>` : ''}
  </article>

  <nav class="navfix" aria-label="Durch die Fragen blättern"><div class="innen">
    <button class="geist" id="zurueck"${i === 0 ? ' disabled' : ''}>Zurück</button>
    ${lauf.frueh && i < fragen.length - 1
      ? `<button class="geist mitte" id="frueh">Auswerten</button>` : ''}
    <button class="cta" id="weiter">${i === fragen.length - 1 ? 'Auswerten' : 'Weiter'}</button>
  </div></nav>`;

  /* Balken erst nach dem Einfügen setzen, damit er sichtbar wächst. */
  requestAnimationFrame(() => {
    const balken = app.querySelector('.balken i');
    if(balken) balken.style.width = ((i + 1) / fragen.length * 100) + '%';
  });

  /* Nur die Antwortgruppe von Multiple Choice und Wahr/Falsch. Die
     Buchstabenreihen der Zuordnung sind ebenfalls Radiogruppen und werden
     weiter unten eigens behandelt. */
  const gruppe = app.querySelector('.modi[role="radiogroup"]');
  if(gruppe) gruppe.addEventListener('change', ereignis => waehle(ereignis.target.value));

  const feld = document.getElementById('inp');
  if(feld){
    feld.addEventListener('input', () => { antworten[q.id] = feld.value; sichernGleich(); });
    feld.addEventListener('blur', sichern);
    /* Am Rechner gleich losschreiben können. Am Handy nicht, dort würde
       sonst bei jeder Frage ungefragt die Bildschirmtastatur aufspringen. */
    if(window.matchMedia('(pointer:fine)').matches){
      feld.focus();
      const ende = feld.value.length;
      if(feld.setSelectionRange) feld.setSelectionRange(ende, ende);
    }
  } else {
    /* Ohne Eingabefeld die Frage selbst fokussieren: sonst springt der Fokus
       beim Blättern auf den Seitenanfang und Screenreader lesen nichts vor. */
    const ueberschrift = document.getElementById('frageText');
    if(ueberschrift) ueberschrift.focus({preventScroll: true});
  }

  const zuordnung = app.querySelector('.zuord');
  if(zuordnung) zuordnung.addEventListener('change', ereignis => {
    const knopf = ereignis.target;
    if(!knopf.dataset.begriff) return;
    const paare = antworten[q.id] = antworten[q.id] || {};

    /* Jeder Buchstabe gehört zu genau einem Begriff. Hatte ihn vorher ein
       anderer, wird der frei, statt die Zuordnung doppelt zu vergeben. */
    Object.keys(paare).forEach(b => {
      if(b !== knopf.dataset.begriff && paare[b] === knopf.value) delete paare[b];
    });
    paare[knopf.dataset.begriff] = knopf.value;

    zuordnung.querySelectorAll('input[data-begriff]').forEach(feld => {
      feld.checked = (paare[feld.dataset.begriff] === feld.value);
      feld.closest('.chip').classList.toggle('an', feld.checked);
    });
    sichern();
  });

  document.getElementById('zurueck').addEventListener('click', blaettereZurueck);
  document.getElementById('weiter').addEventListener('click', blaettereVor);
  const frueh = document.getElementById('frueh');
  if(frueh) frueh.addEventListener('click', () => {
    lauf.fragen = fragen.slice(0, lauf.i + 1);   /* nur Bearbeitetes wird gewertet */
    zeigeErgebnis();
  });
}

function waehle(key){
  const q = lauf.fragen[lauf.i];
  lauf.antworten[q.id] = key;
  app.querySelectorAll('.modi .wahl').forEach(feld => {
    const knopf = feld.querySelector('input');
    knopf.checked = (knopf.value === key);
    feld.classList.toggle('an', knopf.checked);
  });
  sichern();
}

function blaettereZurueck(){
  if(lauf.i > 0){ lauf.i--; sichern(); zeigeFrage(); window.scrollTo(0, 0); }
}
function blaettereVor(){
  if(lauf.i < lauf.fragen.length - 1){ lauf.i++; sichern(); zeigeFrage(); window.scrollTo(0, 0); }
  else zeigeErgebnis();
}


/* ============================ Auswertung ============================ */

/* Ergebnis je Kapitel, in Buchreihenfolge. */
function proKapitel(){
  const werte = new Map();
  lauf.fragen.forEach(q => {
    if(!werte.has(q.kapitel)) werte.set(q.kapitel, {name: q.kapitel_name, richtig: 0, anzahl: 0});
    const eintrag = werte.get(q.kapitel);
    eintrag.anzahl++;
    if(stand(q) === 'richtig') eintrag.richtig++;
  });
  return [...werte.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => e);
}

function deineAntwort(q){
  const a = lauf.antworten[q.id];
  if(a === undefined || a === '' || a === null) return '<i>nicht beantwortet</i>';
  if(q.typ === 'multiple_choice' || q.typ === 'wahr_falsch'){
    const o = optionen(q).find(x => x.key === a);
    return esc(a + ') ' + (o ? o.text : ''));
  }
  if(q.typ === 'zuordnung'){
    const liste = beschreibungen(q);
    return q.begriffe.map(begriff => {
      const b = liste.find(x => x.key === a[begriff]);
      return esc(begriff) + ' = ' + (b ? esc(b.key) + ') ' + esc(b.text) : '—');
    }).join('<br>');
  }
  return esc(a);
}

function musterloesung(q){
  if(q.typ !== 'zuordnung'){
    return esc((q.loesung_key ? zeigeOptKey(q, q.loesung_key) + ') ' : '') + q.loesung);
  }
  const liste = beschreibungen(q);
  return q.begriffe.map(begriff => {
    const key = zeigeKey(q, q.loesung_paare[begriff]);
    const b = liste.find(x => x.key === key);
    return esc(begriff) + ' = ' + esc(key) + ') ' + esc(b ? b.text : '');
  }).join('<br>');
}

function zeigeErgebnis(){
  document.body.classList.remove('imquiz');
  lauf.fertig = true;          /* nichts mehr sichern, der Durchgang ist zu Ende */
  verwerfen();

  let nurOffene = lauf.fragen.length > 60;   /* bei langen Durchgängen die Liste kürzen */

  app.innerHTML = `
  <section class="dunkel ergebnis-hero">
    ${window.netzSVG(820, 420, 18, 23)}
    ${KOPF}
    <div class="wrap" style="padding-top:34px">
      <h1 class="marke" id="auswertungTitel" tabindex="-1">Auswertung</h1>
      <div class="prozent" id="prozent" aria-describedby="bilanz">—</div>
      <p class="bilanz" id="bilanz"></p>
    </div>
  </section>

  <section class="wrap abschnitt">
    <h2 class="marke">Nach Kapitel</h2>
    <div class="kapitel" id="kapitelliste"></div>
  </section>

  <section class="wrap abschnitt letzte">
    <div class="kopfzeile">
      <h2 class="marke">Fragen im Detail</h2>
      <div class="filter" role="group" aria-label="Welche Fragen anzeigen">
        <button data-filter="offen" aria-pressed="${nurOffene}">Nur offene Punkte</button>
        <button data-filter="alle" aria-pressed="${!nurOffene}">Alle</button>
      </div>
    </div>
    <div id="review"></div>
    <button class="geist" id="nochmal" style="margin-top:28px">Neuer Durchgang</button>
  </section>`;

  const kopfBereich = document.getElementById('bilanz');
  const liste = document.getElementById('review');

  function zeichneKopf(){
    const s = bilanz();
    const prozent = document.getElementById('prozent');
    prozent.textContent = s.prozent + '%';
    prozent.classList.toggle('gut', s.prozent >= 60);

    const offen = s.offen
      ? ` · ${s.offen} ${s.offen === 1 ? 'Kurzantwort' : 'Kurzantworten'} noch offen` : '';
    const abbruch = lauf.fragen.length < lauf.gesamt
      ? ` · vorzeitig beendet nach ${lauf.fragen.length} von ${lauf.gesamt} Fragen` : '';
    kopfBereich.textContent = `${s.richtig} von ${s.gewertet} richtig` + offen + abbruch;

    document.getElementById('kapitelliste').innerHTML = proKapitel().map(e => {
      const p = Math.round(e.richtig / e.anzahl * 100);
      return `<div class="z${p < 60 ? ' schwach' : ''}"><span>${esc(e.name)}</span>
        <span class="sp"><i style="width:${p}%"></i></span>
        <span class="zahl">${e.richtig}/${e.anzahl}</span></div>`;
    }).join('');
  }

  function zeichneListe(){
    const sichtbar = lauf.fragen
      .map((q, nr) => ({q, nr, st: stand(q)}))
      .filter(e => !nurOffene || e.st !== 'richtig');

    if(!sichtbar.length){
      liste.innerHTML = `<p class="leer">Alles richtig. Über "Alle" siehst du trotzdem
        jede Frage mit ihrer Lösung.</p>`;
      return;
    }

    liste.innerHTML = sichtbar.map(({q, nr, st}) => {
      const kurz = q.typ === 'kurzantwort';
      return `<article class="rev ${st}">
        <div class="kopfz"><span>${esc(q.block || q.kapitel_name)} · Frage ${nr + 1}</span>
          <span class="status">${st}</span></div>
        <p class="wortlaut">${esc(q.frage)}</p>
        <p class="eigene"><span class="lab">Deine Antwort</span>${deineAntwort(q)}</p>
        ${st === 'richtig' && (q.typ === 'multiple_choice' || q.typ === 'wahr_falsch') ? ''
          : `<p><span class="lab">${kurz ? 'Musterlösung' : 'Richtige Antwort'}</span>${musterloesung(q)}</p>`}
        ${kurz ? `<div class="selbst" role="group" aria-label="Kurzantwort selbst bewerten"
            data-fuer="${esc(q.id)}">
          <button data-wert="1" aria-pressed="${lauf.selbst[q.id] === true}"
            ${lauf.selbst[q.id] === true ? 'class="an"' : ''}>Hatte ich</button>
          <button data-wert="0" aria-pressed="${lauf.selbst[q.id] === false}"
            ${lauf.selbst[q.id] === false ? 'class="an nein"' : ''}>Hatte ich nicht</button>
        </div>` : ''}
      </article>`;
    }).join('');
  }

  /* Selbstbewertung der Kurzantworten, über Delegation statt Handler je Knopf. */
  liste.addEventListener('click', ereignis => {
    const knopf = ereignis.target.closest('.selbst button');
    if(!knopf) return;
    const kasten = knopf.closest('.selbst');
    const id = kasten.dataset.fuer;
    lauf.selbst[id] = knopf.dataset.wert === '1';

    kasten.querySelectorAll('button').forEach(x => {
      const an = x === knopf;
      x.classList.toggle('an', an);
      x.classList.toggle('nein', an && !lauf.selbst[id]);
      x.setAttribute('aria-pressed', String(an));
    });

    const artikel = kasten.closest('.rev');
    const neu = lauf.selbst[id] ? 'richtig' : 'falsch';
    artikel.className = 'rev ' + neu;
    artikel.querySelector('.status').textContent = neu;
    zeichneKopf();
  });

  app.querySelector('.filter').addEventListener('click', ereignis => {
    const knopf = ereignis.target.closest('button[data-filter]');
    if(!knopf) return;
    nurOffene = knopf.dataset.filter === 'offen';
    app.querySelectorAll('.filter button').forEach(x => {
      x.setAttribute('aria-pressed', String(x === knopf));
    });
    zeichneListe();
  });

  document.getElementById('nochmal').addEventListener('click', () => {
    zeigeStart();
    window.scrollTo(0, 0);
  });

  zeichneKopf();
  zeichneListe();
  window.scrollTo(0, 0);
  document.getElementById('auswertungTitel').focus({preventScroll: true});
}


/* ============================== Tastatur ============================== */

/* Liegt der Fokus auf einem Bedienelement, gehört die Taste diesem Element
   und nicht der Seitennavigation. Sonst ließe sich mit der Eingabetaste
   keine Antwort mehr auswählen und mit den Pfeilen nicht mehr blättern. */
function imBedienelement(ziel){
  return !!(ziel && ziel.closest && ziel.closest('button, select, a, input, textarea'));
}

document.addEventListener('keydown', ereignis => {
  if(ereignis.ctrlKey || ereignis.metaKey || ereignis.altKey) return;

  const ziel = ereignis.target;
  const imQuiz = document.body.classList.contains('imquiz');

  /* Startseite: Ziffern wählen den Umfang, Eingabetaste startet. */
  if(!imQuiz){
    const gruppe = document.getElementById('modus');
    if(!gruppe || imBedienelement(ziel)) return;
    const nummer = Number(ereignis.key);
    const felder = [...gruppe.querySelectorAll('input[name="umfang"]')];
    if(nummer >= 1 && nummer <= felder.length){
      ereignis.preventDefault();
      felder[nummer - 1].checked = true;
      gruppe.dispatchEvent(new Event('change'));
      return;
    }
    if(ereignis.key === 'Enter'){
      ereignis.preventDefault();
      const los = document.getElementById('los');
      if(los) los.click();
    }
    return;
  }

  if(!lauf) return;

  /* Die Eingabetaste geht zur nächsten Frage. Ausgenommen sind Stellen, an
     denen sie schon etwas bedeutet: das mehrzeilige Feld der Kurzantwort,
     Knöpfe, Auswahllisten und Verweise. Auf einer Antwort ist sie frei, dort
     wählt man mit Leertaste oder Pfeiltasten. */
  if(ereignis.key === 'Enter'){
    if(ziel && (ziel.tagName === 'TEXTAREA' || ziel.closest('button, select, a'))) return;
    ereignis.preventDefault();
    blaettereVor();
    return;
  }

  /* Pfeiltasten gehören in eine Antwortgruppe oder Auswahlliste, wenn der
     Fokus dort liegt, sonst blättern sie. */
  if(ereignis.key === 'ArrowLeft' || ereignis.key === 'ArrowRight'){
    if(ziel && ziel.closest('[role="radiogroup"], select')) return;
  }

  if(ereignis.key === 'ArrowRight'){ ereignis.preventDefault(); blaettereVor(); return; }
  if(ereignis.key === 'ArrowLeft'){  ereignis.preventDefault(); blaettereZurueck(); return; }

  if(ziel && /^(INPUT|TEXTAREA|SELECT)$/.test(ziel.tagName)) return;

  const antworten = [...app.querySelectorAll('.modi input[name="antwort"]')];
  if(!antworten.length) return;
  const nummer = Number(ereignis.key);
  if(nummer >= 1 && nummer <= antworten.length){
    ereignis.preventDefault();
    waehle(antworten[nummer - 1].value);
    return;
  }
  const buchstabe = ereignis.key.toUpperCase();
  if(antworten.some(a => a.value === buchstabe)){
    ereignis.preventDefault();
    waehle(buchstabe);
  }
});

window.addEventListener('beforeunload', sichern);

zeigeStart();

})();
