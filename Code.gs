/**
 * Zwets Projecten — opslag in deze Google Sheet.
 *
 * Tabbladen (worden aangemaakt door de functie "installeer"):
 *  - Schilders : Naam | Pincode | Rol | ID | Vergrendeld
 *                Rol = schilder of kantoor. Kantoor beheert projecten, materiaal en schilders.
 *                Na 5 foute pincodes komt er bij Vergrendeld een datum; maak die cel leeg om vrij te geven.
 *  - Projecten : ID | Naam | Adres | Budget | Uurtarief | Afgerond | Aangemaakt
 *  - Materiaal : ID | ProjectID | Project | Datum | Omschrijving | Bedrag | Door | DoorID
 *  - Uren      : ID | ProjectID | Project | Datum | SchilderID | Schilder | Dagdeel | Uren
 *
 * Eenmalig: kies hierboven de functie "installeer" en klik op Uitvoeren.
 * Daarna:  Implementeren > Nieuwe implementatie > Web-app, Uitvoeren als: Ik, Toegang: Iedereen.
 * Bijwerken: plak deze code, Opslaan, dan Implementeren > Implementaties beheren >
 *            potloodje > Versie: Nieuwe versie > Implementeren. De link blijft gelijk.
 */

/* ------------------------------------------------------------ installatie */

function installeer() {
  Object.keys(TABS).forEach(function (t) {
    var sh = sheet_(t);
    sh.getRange(1, 1, 1, TABS[t].length).setValues([TABS[t]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  sheet_('Schilders').getRange('B:B').setNumberFormat('@');
  sheet_('Materiaal').getRange('D:D').setNumberFormat('@');
  sheet_('Uren').getRange('D:D').setNumberFormat('@');
  sheet_('Materiaal').getRange('F:F').setNumberFormat('€ #,##0.00');
  sheet_('Projecten').getRange('D:E').setNumberFormat('€ #,##0.00');
  var leeg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Blad1') || SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  if (leeg && leeg.getLastRow() === 0) SpreadsheetApp.getActiveSpreadsheet().deleteSheet(leeg);
  if (lees_('Schilders').length === 0) voegToe_('Schilders', { Naam: 'Kantoor', Pincode: "'1234", Rol: 'kantoor', ID: 's-kantoor', Vergrendeld: '' });
}

var MAX_FOUT = 5;
var TABS = {
  Schilders: ['Naam', 'Pincode', 'Rol', 'ID', 'Vergrendeld'],
  Projecten: ['ID', 'Naam', 'Adres', 'Budget', 'Uurtarief', 'Afgerond', 'Aangemaakt'],
  Materiaal: ['ID', 'ProjectID', 'Project', 'Datum', 'Omschrijving', 'Bedrag', 'Door', 'DoorID'],
  Uren:      ['ID', 'ProjectID', 'Project', 'Datum', 'SchilderID', 'Schilder', 'Dagdeel', 'Uren']
};
var DAGDELEN = { ochtend: 4, middag: 4, dag: 8 };

/* ------------------------------------------------------------------ web */

function doGet() {
  return out_({ ok: true, app: 'Zwets Projecten', versie: 1, tijd: new Date().toISOString() });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'Ongeldig verzoek.' }); }
  try {
    switch (body.action) {
      case 'namen':        return out_({ ok: true, namen: namen_() });
      case 'login':        return out_({ ok: true, me: auth_(body) });
      case 'data':         return out_(data_(body));
      case 'urenToevoegen':return out_(metLock_(urenToevoegen_, body));
      case 'urenWeg':      return out_(metLock_(urenWeg_, body));
      case 'matToevoegen': return out_(metLock_(matToevoegen_, body));
      case 'matWeg':       return out_(metLock_(matWeg_, body));
      case 'projectOpslaan': return out_(metLock_(projectOpslaan_, body));
      case 'projectWeg':   return out_(metLock_(projectWeg_, body));
      case 'schilderOpslaan': return out_(metLock_(schilderOpslaan_, body));
      case 'schilderWeg':  return out_(metLock_(schilderWeg_, body));
      case 'pinWijzigen':  return out_(metLock_(pinWijzigen_, body));
      default:             return out_({ ok: false, error: 'Onbekende actie.' });
    }
  } catch (err) {
    return out_({ ok: false, code: err.code || 'fout', error: err.message || String(err) });
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function fout_(msg, code) { var e = new Error(msg); e.code = code || 'fout'; return e; }
function metLock_(fn, body) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return fn(body); } finally { lock.releaseLock(); }
}

/* ---------------------------------------------------------- tabellen */

function sheet_(naam) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(naam);
  if (!sh) {
    try { sh = ss.insertSheet(naam); } catch (e) { SpreadsheetApp.flush(); sh = ss.getSheetByName(naam); if (!sh) throw e; }
    sh.getRange(1, 1, 1, TABS[naam].length).setValues([TABS[naam]]).setFontWeight('bold'); sh.setFrozenRows(1);
  }
  return sh;
}
function tz_() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(); }
function cel_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return v;
}
/** Leest een tabblad als lijst objecten (met rijnummer). */
function lees_(naam) {
  var sh = sheet_(naam), kop = TABS[naam], last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, kop.length).getValues().map(function (r, i) {
    var o = { _rij: i + 2 };
    kop.forEach(function (k, j) { o[k] = cel_(r[j]); });
    return o;
  });
}
function voegToe_(naam, o) {
  var sh = sheet_(naam), kop = TABS[naam];
  var rij = kop.map(function (k) { return o[k] === undefined ? '' : o[k]; });
  sh.appendRow(rij);
  // datums als tekst houden (geen tijdzone-verschuiving)
  var di = kop.indexOf('Datum');
  if (di >= 0) sh.getRange(sh.getLastRow(), di + 1).setNumberFormat('@').setValue(o.Datum);
}
function werkBij_(naam, rijNr, o) {
  var sh = sheet_(naam), kop = TABS[naam];
  kop.forEach(function (k, j) { if (o[k] !== undefined) sh.getRange(rijNr, j + 1).setValue(o[k]); });
}
function verwijderRijen_(naam, rijen) {
  var sh = sheet_(naam);
  rijen.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
}
function nieuwId_(prefix) { return prefix + '-' + Utilities.getUuid().slice(0, 8); }
function num_(v) { var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }
function datum_(v) {
  var s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw fout_('Ongeldige datum.');
  return s;
}

/* ------------------------------------------------------------ inloggen */

function pinStr_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return String(Math.round(v));
  return String(v).trim();
}
function slug_(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'schilder';
}

/** Leest Schilders en vult ontbrekende ID's aan. */
function schilders_() {
  var lijst = lees_('Schilders').filter(function (s) { return String(s.Naam || '').trim(); });
  var gebruikt = {};
  lijst.forEach(function (s) { if (s.ID) gebruikt[s.ID] = true; });
  lijst.forEach(function (s) {
    if (!s.ID) {
      var basis = 's-' + slug_(s.Naam), kand = basis, n = 2;
      while (gebruikt[kand]) kand = basis + '-' + (n++);
      s.ID = kand; gebruikt[kand] = true;
      werkBij_('Schilders', s._rij, { ID: kand });
    }
    s.Naam = String(s.Naam).trim();
    s.Rol = String(s.Rol || '').trim().toLowerCase() === 'kantoor' ? 'kantoor' : 'schilder';
    s.pin = pinStr_(s.Pincode);
    s.slot = s.Vergrendeld !== '' && s.Vergrendeld !== null;
  });
  return lijst;
}

function namen_() {
  if (lees_('Schilders').length === 0) installeer();
  return schilders_().filter(function (s) { return s.pin; })
    .map(function (s) { return { id: s.ID, naam: s.Naam }; })
    .sort(function (a, b) { return a.naam.localeCompare(b.naam, 'nl'); });
}

function auth_(body) {
  var id = String(body.id || ''), pin = pinStr_(body.pin);
  if (!id || !pin) throw fout_('Kies je naam en vul je pincode in.', 'auth');
  var s = schilders_().filter(function (x) { return x.ID === id; })[0];
  if (!s) throw fout_('Naam of pincode klopt niet.', 'auth');
  if (s.slot) throw fout_('Je account is vergrendeld na ' + MAX_FOUT + ' foute pincodes. Vraag kantoor om het vrij te geven.', 'slot');
  var props = PropertiesService.getScriptProperties(), key = 'fout:' + id;
  var ok = s.pin && (s.pin === pin || (/^\d+$/.test(s.pin) && /^\d+$/.test(pin) && Number(s.pin) === Number(pin)));
  if (!ok) {
    var fouten = Number(props.getProperty(key) || 0) + 1;
    if (fouten >= MAX_FOUT) {
      props.deleteProperty(key);
      werkBij_('Schilders', s._rij, { Vergrendeld: new Date() });
      throw fout_('Te vaak een verkeerde pincode. Je account is vergrendeld; vraag kantoor om het vrij te geven.', 'slot');
    }
    props.setProperty(key, String(fouten));
    var rest = MAX_FOUT - fouten;
    throw fout_('Pincode klopt niet. Nog ' + rest + (rest === 1 ? ' poging' : ' pogingen') + ', daarna wordt je account vergrendeld.', 'auth');
  }
  if (props.getProperty(key)) props.deleteProperty(key);
  return { id: s.ID, naam: s.Naam, rol: s.Rol };
}
function kantoor_(me) { if (me.rol !== 'kantoor') throw fout_('Alleen kantoor mag dit aanpassen.', 'denied'); }

/* ---------------------------------------------------------------- data */

function data_(body) {
  var me = auth_(body);
  var sch = schilders_();
  return {
    ok: true, me: me,
    projecten: lees_('Projecten').filter(function (p) { return p.ID; }).map(function (p) {
      return { id: p.ID, naam: p.Naam, adres: p.Adres, budget: num_(p.Budget), uurtarief: num_(p.Uurtarief), afgerond: p.Afgerond === true || String(p.Afgerond).toLowerCase() === 'ja', aangemaakt: p.Aangemaakt };
    }),
    materiaal: lees_('Materiaal').filter(function (m) { return m.ID; }).map(function (m) {
      return { id: m.ID, project: m.ProjectID, datum: m.Datum, omschrijving: m.Omschrijving, bedrag: num_(m.Bedrag), door: m.Door, doorId: m.DoorID };
    }),
    uren: lees_('Uren').filter(function (u) { return u.ID; }).map(function (u) {
      return { id: u.ID, project: u.ProjectID, datum: u.Datum, schilderId: u.SchilderID, schilder: u.Schilder, dagdeel: u.Dagdeel, uren: num_(u.Uren) };
    }),
    schilders: sch.map(function (s) {
      var o = { id: s.ID, naam: s.Naam, rol: s.Rol };
      if (me.rol === 'kantoor') { o.heeftPin = !!s.pin; o.slot = s.slot; }
      return o;
    })
  };
}

function project_(id) {
  var p = lees_('Projecten').filter(function (x) { return x.ID === id; })[0];
  if (!p) throw fout_('Project niet gevonden.');
  return p;
}

/* ---------------------------------------------------------------- uren */

function urenToevoegen_(body) {
  var me = auth_(body);
  var sid = me.id;
  if (body.schilderId && body.schilderId !== me.id) { kantoor_(me); sid = String(body.schilderId); }
  var s = schilders_().filter(function (x) { return x.ID === sid; })[0];
  if (!s) throw fout_('Schilder niet gevonden.');
  var p = project_(String(body.project));
  if (p.Afgerond === true || String(p.Afgerond).toLowerCase() === 'ja') throw fout_('Dit project is afgerond.');
  var deel = String(body.dagdeel); if (!DAGDELEN[deel]) throw fout_('Kies een dagdeel.');
  var d = datum_(body.datum);
  var dubbel = lees_('Uren').some(function (u) {
    return u.ProjectID === p.ID && u.SchilderID === sid && u.Datum === d && (u.Dagdeel === 'dag' || deel === 'dag' || u.Dagdeel === deel);
  });
  if (dubbel) throw fout_(s.Naam + ' heeft dit dagdeel op deze dag al ingevuld.');
  voegToe_('Uren', { ID: nieuwId_('u'), ProjectID: p.ID, Project: p.Naam, Datum: d, SchilderID: sid, Schilder: s.Naam, Dagdeel: deel, Uren: DAGDELEN[deel] });
  return { ok: true };
}

function urenWeg_(body) {
  var me = auth_(body);
  var u = lees_('Uren').filter(function (x) { return x.ID === body.uid; })[0];
  if (!u) return { ok: true };
  if (u.SchilderID !== me.id) kantoor_(me);
  verwijderRijen_('Uren', [u._rij]);
  return { ok: true };
}

/* ------------------------------------------------------------ materiaal */

function matToevoegen_(body) {
  var me = auth_(body);
  var p = project_(String(body.project));
  var oms = String(body.omschrijving || '').trim(); if (!oms) throw fout_('Vul een omschrijving in.');
  voegToe_('Materiaal', { ID: nieuwId_('m'), ProjectID: p.ID, Project: p.Naam, Datum: datum_(body.datum), Omschrijving: oms.slice(0, 300), Bedrag: num_(body.bedrag), Door: me.naam, DoorID: me.id });
  return { ok: true };
}

function matWeg_(body) {
  var me = auth_(body);
  var m = lees_('Materiaal').filter(function (x) { return x.ID === body.mid; })[0];
  if (!m) return { ok: true };
  if (m.DoorID !== me.id) kantoor_(me);
  verwijderRijen_('Materiaal', [m._rij]);
  return { ok: true };
}

/* ------------------------------------------------------------ projecten */

function projectOpslaan_(body) {
  var me = auth_(body); kantoor_(me);
  var naam = String(body.naam || '').trim(); if (!naam) throw fout_('Vul een projectnaam in.');
  var tarief = num_(body.uurtarief); if (!(tarief > 0)) throw fout_('Vul een uurtarief groter dan 0 in.');
  var o = { Naam: naam, Adres: String(body.adres || '').trim(), Budget: num_(body.budget), Uurtarief: tarief, Afgerond: body.afgerond ? 'ja' : '' };
  if (body.pid) {
    var p = project_(String(body.pid));
    werkBij_('Projecten', p._rij, o);
    if (p.Naam !== naam) { // projectnaam in de leesbare kolommen bijwerken
      ['Materiaal', 'Uren'].forEach(function (t) { lees_(t).forEach(function (r) { if (r.ProjectID === p.ID) werkBij_(t, r._rij, { Project: naam }); }); });
    }
    return { ok: true, id: p.ID };
  }
  o.ID = nieuwId_('p'); o.Aangemaakt = new Date();
  voegToe_('Projecten', o);
  return { ok: true, id: o.ID };
}

function projectWeg_(body) {
  var me = auth_(body); kantoor_(me);
  var p = project_(String(body.pid));
  ['Materiaal', 'Uren'].forEach(function (t) {
    verwijderRijen_(t, lees_(t).filter(function (r) { return r.ProjectID === p.ID; }).map(function (r) { return r._rij; }));
  });
  verwijderRijen_('Projecten', [p._rij]);
  return { ok: true };
}

/* ------------------------------------------------------------ schilders */

function schilderOpslaan_(body) {
  var me = auth_(body); kantoor_(me);
  var naam = String(body.naam || '').trim(); if (!naam) throw fout_('Vul een naam in.');
  var pin = pinStr_(body.schilderPin);
  if (!/^\d{4,6}$/.test(pin)) throw fout_('De pincode moet 4 tot 6 cijfers zijn.');
  var rol = body.rol === 'kantoor' ? 'kantoor' : 'schilder';
  var lijst = schilders_();
  if (body.sid) {
    var s = lijst.filter(function (x) { return x.ID === body.sid; })[0];
    if (!s) throw fout_('Schilder niet gevonden.');
    werkBij_('Schilders', s._rij, { Naam: naam, Pincode: "'" + pin, Rol: rol, Vergrendeld: '' });
    return { ok: true };
  }
  if (lijst.some(function (x) { return x.Naam.toLowerCase() === naam.toLowerCase(); })) throw fout_(naam + ' staat al in de lijst.');
  var basis = 's-' + slug_(naam), id = basis, n = 2;
  while (lijst.some(function (x) { return x.ID === id; })) id = basis + '-' + (n++);
  voegToe_('Schilders', { Naam: naam, Pincode: "'" + pin, Rol: rol, ID: id, Vergrendeld: '' });
  return { ok: true };
}

function schilderWeg_(body) {
  var me = auth_(body); kantoor_(me);
  if (body.sid === me.id) throw fout_('Je kunt jezelf niet verwijderen.');
  var s = schilders_().filter(function (x) { return x.ID === body.sid; })[0];
  if (s) verwijderRijen_('Schilders', [s._rij]);   // ingevulde uren blijven bewaard
  return { ok: true };
}

function pinWijzigen_(body) {
  var me = auth_(body);
  var pin = pinStr_(body.nieuwePin);
  if (!/^\d{4,6}$/.test(pin)) throw fout_('De pincode moet 4 tot 6 cijfers zijn.');
  var s = schilders_().filter(function (x) { return x.ID === me.id; })[0];
  werkBij_('Schilders', s._rij, { Pincode: "'" + pin });
  return { ok: true };
}
