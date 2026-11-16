/* Knotengraph wie auf dem Buchumschlag.
   Punkte werden mit einem Mindestabstand gesetzt, sonst verklumpen sie bei
   reinem Zufall, und danach mit ihren naechsten Nachbarn verbunden.
   Der Zufall laeuft ueber einen festen Startwert, damit dieselbe Seite
   immer dasselbe Muster zeigt. */
window.netzSVG = function netzSVG(breite, hoehe, anzahl, saat){
  /* Linearer Kongruenzgenerator, Faktor und Summand wie in der C-Bibliothek.
     Math.imul rechnet die Multiplikation in 32 Bit, sonst liefe sie über die
     53 Bit hinaus, die eine Gleitkommazahl genau abbilden kann. */
  let s = saat >>> 0;
  const zufall = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 1) / 0x80000000;
  };

  const MINDEST = Math.max(90, Math.min(breite, hoehe) * 0.22);
  const knoten = [];
  for(let versuch = 0; versuch < 4000 && knoten.length < anzahl; versuch++){
    const k = [zufall() * (breite + 160) - 80, zufall() * hoehe];
    const weitGenug = knoten.every(([x, y]) => (k[0]-x)**2 + (k[1]-y)**2 >= MINDEST**2);
    if(weitGenug) knoten.push(k);
  }

  const kanten = new Set();
  const merke = (i, j) => kanten.add(Math.min(i,j) + '-' + Math.max(i,j));
  knoten.forEach(([x, y], i) => {
    const nachbarn = knoten
      .map((k, j) => [j, (x-k[0])**2 + (y-k[1])**2])
      .filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1]);
    nachbarn.slice(0, 2).forEach(([j]) => merke(i, j));
    nachbarn.slice(2, 5).forEach(([j, abstand]) => {
      if(abstand < (MINDEST * 1.9)**2) merke(i, j);
    });
  });

  const rund = n => n.toFixed(0);
  let teile = '';
  kanten.forEach(k => {
    const [i, j] = k.split('-').map(Number);
    teile += `<line x1="${rund(knoten[i][0])}" y1="${rund(knoten[i][1])}"`
          +  ` x2="${rund(knoten[j][0])}" y2="${rund(knoten[j][1])}"`
          +  ` stroke="#F4F1EC" stroke-width="1.5" opacity="0.14"/>`;
  });
  knoten.forEach(([x, y]) => {
    teile += `<circle cx="${rund(x)}" cy="${rund(y)}" r="4.5" fill="#F4F1EC" opacity="0.26"/>`
          +  `<circle cx="${rund(x)}" cy="${rund(y)}" r="10" fill="none"`
          +  ` stroke="#F4F1EC" stroke-width="1.5" opacity="0.12"/>`;
  });

  /* Verlaufsmaske: links blass, rechts voll, damit die Schrift frei steht. */
  const id = 'netz' + saat;
  return `<svg class="netz" viewBox="0 0 ${breite} ${hoehe}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="v${id}" x1="0" x2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.12"/>
        <stop offset="0.45" stop-color="#fff" stop-opacity="0.45"/>
        <stop offset="1" stop-color="#fff" stop-opacity="1"/>
      </linearGradient>
      <mask id="m${id}"><rect width="${breite}" height="${hoehe}" fill="url(#v${id})"/></mask>
    </defs>
    <g mask="url(#m${id})">${teile}</g>
  </svg>`;
};
