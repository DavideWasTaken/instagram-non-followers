/* ============================================================
   Chi segui che NON ti segue - da eseguire nella console Chrome
   su una scheda instagram.com dove sei loggato.
   ============================================================ */
(async () => {
  const APP_ID = '936619743392459';
  const PAGINA = 50;          // profili per richiesta
  const PAUSA_MIN = 1200;     // ms tra le richieste; non eliminano il rischio di blocchi
  const PAUSA_MAX = 2600;

  if (location.protocol !== 'https:' ||
      !(location.hostname === 'instagram.com' || location.hostname.endsWith('.instagram.com'))) {
    alert('Apri prima instagram.com e rilancia lo script da questa scheda.');
    return;
  }

  const dormi = ms => new Promise(r => setTimeout(r, ms));
  const pausa = () => dormi(PAUSA_MIN + Math.random() * (PAUSA_MAX - PAUSA_MIN));

  const mioId = document.cookie.match(/(?:^|;\s*)ds_user_id=(\d+)/)?.[1];
  if (!mioId) {
    console.error('Non trovo il cookie ds_user_id: assicurati di essere loggato su questa scheda.');
    return;
  }

  async function scarica(tipo) {   // tipo = 'following' | 'followers'
    const utenti = new Map();
    const cursori = new Set();
    let maxId = '', pagina = 0, tentativi = 0;

    while (pagina < 300) {
      const url = `https://www.instagram.com/api/v1/friendships/${mioId}/${tipo}/`
        + `?count=${PAGINA}${maxId ? `&max_id=${encodeURIComponent(maxId)}` : ''}`
        + (tipo === 'followers' ? '&search_surface=follow_list_page' : '');

      let res;
      try {
        res = await fetch(url, { headers: { 'x-ig-app-id': APP_ID }, credentials: 'include',
          signal: AbortSignal.timeout(30000) });
      } catch (e) {
        if (++tentativi > 5) throw new Error(`Rete non raggiungibile su ${tipo}: ${e.message}`);
        await dormi(5000 * tentativi);
        continue;
      }

      if (res.status === 429 || res.status === 560) {          // rate limit
        if (++tentativi > 6) throw new Error(`Instagram sta limitando le richieste (${tipo}). Riprova tra qualche minuto.`);
        const attesa = 15000 * tentativi;
        console.warn(`  rate limit, aspetto ${attesa / 1000}s...`);
        await dormi(attesa);
        continue;
      }
      if (!res.ok) throw new Error(`Errore HTTP ${res.status} su ${tipo}`);

      tentativi = 0;
      const dati = await res.json();
      if (!dati || (dati.status && dati.status !== 'ok') || !Array.isArray(dati.users)) {
        throw new Error(`Risposta inattesa su ${tipo}. La sessione o l'API potrebbero essere cambiate.`);
      }
      for (const u of dati.users) {
        if (!u || !/^\d+$/.test(String(u.pk ?? u.id ?? '')) ||
            typeof u.username !== 'string' || !u.username.trim()) {
          throw new Error(`Dati utente incompleti su ${tipo}.`);
        }
        utenti.set(String(u.pk ?? u.id), {
          username: u.username,
          nome: String(u.full_name || ''),
          verificato: !!u.is_verified,
          privato: !!u.is_private,
        });
      }

      pagina++;
      console.log(`  ${tipo}: ${utenti.size} raccolti (pagina ${pagina})`);
      if (!dati.next_max_id) {
        if (dati.more_available) throw new Error(`Paginazione incompleta su ${tipo}.`);
        return utenti;
      }
      if (!['string', 'number'].includes(typeof dati.next_max_id)) {
        throw new Error(`Cursore non valido su ${tipo}.`);
      }
      maxId = String(dati.next_max_id);
      if (cursori.has(maxId)) throw new Error(`Paginazione ripetuta su ${tipo}.`);
      cursori.add(maxId);
      await pausa();
    }
    throw new Error(`Raggiunto il limite di 300 pagine su ${tipo}: elenco incompleto.`);
  }

  console.log('Scarico chi segui...');
  const seguiti = await scarica('following');
  await pausa();
  console.log('Scarico chi ti segue...');
  const follower = await scarica('followers');

  const idFollower = new Set(follower.keys());
  const nonRicambiano = [...seguiti.entries()]
    .filter(([id]) => !idFollower.has(id))
    .map(([, u]) => u)
    .sort((a, b) => a.username.localeCompare(b.username));

  const persone = nonRicambiano.filter(u => !u.verificato);
  const verificati = nonRicambiano.filter(u => u.verificato);

  console.log(`\n%cSegui ${seguiti.size} account, ti seguono ${follower.size}.`, 'font-weight:bold');
  console.log(`%cNon ti ricambiano: ${nonRicambiano.length} (${persone.length} non verificati + ${verificati.length} verificati)`,
              'font-weight:bold;color:#c00');

  console.table(persone.map(u => ({ username: u.username, nome: u.nome, privato: u.privato })));
  if (verificati.length) {
    console.log('%cAccount verificati:', 'color:#888');
    console.log(verificati.map(u => u.username).join(', '));
  }

  // elenco pronto da copiare
  const testo = nonRicambiano.map(u => u.username).join('\n');
  window.nonMiSeguono = nonRicambiano.map(u => u.username);
  try { await navigator.clipboard.writeText(testo); console.log('%cElenco copiato negli appunti.', 'color:#080'); }
  catch { console.log('Copia manuale: copy(nonMiSeguono.join("\\n"))'); }

  // download CSV
  const cellaCSV = value => {
    let testo = String(value);
    // I nomi dei profili sono input esterno: evita formule nei fogli di calcolo.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(testo) || /^[\t\r\n]/.test(testo)) testo = "'" + testo;
    return `"${testo.replace(/"/g, '""')}"`;
  };
  const csv = 'username,nome,verificato,privato\n' + nonRicambiano
    .map(u => [u.username, u.nome, u.verificato, u.privato].map(cellaCSV).join(','))
    .join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'non_ti_seguono.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  console.log('%cScaricato non_ti_seguono.csv', 'color:#080');
})().catch(error => {
  console.error(`Analisi interrotta: ${error.message}`);
  console.error('Il risultato potrebbe essere incompleto. Nessun nuovo confronto viene esportato.');
});
