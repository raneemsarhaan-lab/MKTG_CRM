// Node checks of src/lib/hours.ts (spec 014 T010): dates, working days,
// parsing what members type, validation, totals and the CSV.
import path from 'node:path'
import { createRequire } from 'node:module'

export async function runPure(lab, root) {
  const h = await import(path.join(lab, 'out/pure.mjs'))
  const require = createRequire(path.join(root, 'package.json'))
  const { IntlMessageFormat } = require('intl-messageformat')
  const results = []
  const check = async (id, fn) => { try { await fn(); results.push({ id, ok: true }) } catch (e) { results.push({ id, ok: false, error: e.message }) } }
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
  const ok = (c, msg) => { if (!c) throw new Error(msg) }

  await check('dates', () => {
    eq(h.addDays('2026-11-15', -1), '2026-11-14', 'back a day')
    eq(h.addDays('2026-03-01', -1), '2026-02-28', 'across a month')
    eq(h.addDays('2028-03-01', -1), '2028-02-29', 'leap year')
    eq(h.weekday('2026-11-15'), 0, '15 Nov 2026 is a Sunday')
    eq(h.weekOf('2026-11-19'), '2026-11-15', 'a Thursday’s week starts on Sunday')
    eq(h.weekOf('2026-11-21'), '2026-11-15', 'Saturday is still that week')
    ok(!h.isDate('2026-02-30') && !h.isDate('2026-13-01') && !h.isDate('15/11/2026'), 'bad dates refused')
    eq(h.daysBetween('2026-11-01', '2026-11-15'), 14, 'days between')
  })
  await check('working-days', () => {
    eq(['2026-11-15', '2026-11-19', '2026-11-20', '2026-11-21'].map(h.isWorkingDay), [true, true, false, false], 'Sun–Thu work, Fri–Sat off')
    eq(h.lastWorkingDayBefore('2026-11-15', '2020-01-01'), '2026-11-12', 'Sunday asks about Thursday')
    eq(h.lastWorkingDayBefore('2026-11-17', '2020-01-01'), '2026-11-16', 'Tuesday asks about Monday')
    eq(h.lastWorkingDayBefore('2026-11-21', '2020-01-01'), '2026-11-19', 'Saturday asks about Thursday')
    eq(h.lastWorkingDayBefore('2026-11-15', '2026-11-14'), null, 'an account newer than that day is not asked')
    eq(h.lastWorkingDayBefore('2026-11-16', '2026-11-15'), '2026-11-15', 'asked from its first day on')
  })
  await check('missing', () => {
    const logged = new Set(['2026-11-10', '2026-11-12'])
    eq(h.missingDays(logged, '2026-11-08', '2026-11-14', '2020-01-01'), ['2026-11-11', '2026-11-09', '2026-11-08'], 'working days with no entry, newest first; Fri/Sat never missing')
    eq(h.missingDays(new Set(), '2026-11-08', '2026-11-14', '2026-11-11'), ['2026-11-12', '2026-11-11'], 'nothing before the account existed')
  })
  await check('parse', () => {
    const p = s => { const r = h.parseHours(s); return r.ok ? r.hours : r.error }
    eq(['7.5', '7,5', '7:30', '8', '0', '24', '٧٫٥', '٨', '7.25 h', '۶', ' 6 ', ''].map(p), [7.5, 7.5, 7.5, 8, 0, 24, 7.5, 8, 7.25, 6, 6, null], 'accepted forms')
    eq(['30', '-1', 'abc', '7:75', '24.25', '1e1'].map(p), ['bad_hours', 'bad_hours', 'bad_hours', 'bad_hours', 'bad_hours', 'bad_hours'], 'out of range or not a number')
    eq(['7.1', '7:10', '0.3'].map(p), ['bad_step', 'bad_step', 'bad_step'], 'not on a quarter hour')
  })
  await check('validate', () => {
    const today = '2026-11-15'
    eq(h.validateLines([{ date: '2026-11-12', hours: 8, off: false }, { date: '2026-11-11', hours: null, off: true }], { today, admin: false }), [], 'good lines pass')
    eq(h.validateLines([{ date: '2026-11-16', hours: 8, off: false }], { today, admin: false }), [], 'tomorrow allowed (time zones ahead)')
    eq(h.validateLines([{ date: '2026-11-17', hours: 8, off: false }], { today, admin: false }).map(e => e.error), ['future'], 'two days ahead refused')
    eq(h.validateLines([{ date: '2026-10-01', hours: 8, off: false }], { today, admin: false }).map(e => e.error), ['too_old'], 'older than 30 days, member')
    eq(h.validateLines([{ date: '2026-10-01', hours: 8, off: false }], { today, admin: true }), [], 'older than 30 days, admin')
    eq(h.validateLines([{ date: '2026-11-12', hours: 30, off: false }, { date: '2026-11-11', hours: 7.1, off: false }, { date: '2026-11-11', hours: 8, off: false }, { date: 'x', hours: 1, off: false }], { today, admin: false }).map(e => e.error),
      ['bad_hours', 'bad_step', 'duplicate', 'bad_date'], 'every problem named')
  })
  await check('totals', () => {
    const days = h.weekDays('2026-11-08')
    const rows = [
      { days: { '2026-11-08': { date: '2026-11-08', hours: 8, off: false }, '2026-11-09': { date: '2026-11-09', hours: null, off: true }, '2026-11-10': { date: '2026-11-10', hours: 7.5, off: false } } },
      { days: { '2026-11-08': { date: '2026-11-08', hours: 6.25, off: false } } },
    ]
    const t = h.weekTotals(rows, days)
    eq(t.perMember, [15.5, 6.25], 'per member; Off counts 0')
    eq(t.perDay['2026-11-08'], 14.25, 'per day')
    ok(h.weekComplete(rows[0].days, days, '2026-11-11', '2020-01-01'), 'Sun–Tue all logged before Wednesday')
    ok(!h.weekComplete(rows[1].days, days, '2026-11-11', '2020-01-01'), 'a missing Monday is incomplete')
  })
  await check('csv', () => {
    const report = { days: ['2026-11-08', '2026-11-09', '2026-11-13'], dayTotals: { '2026-11-08': 8, '2026-11-09': 0, '2026-11-13': 0 },
      rows: [{ name: 'رنا "R", Saeed', capacity: 40, total: 8, days: { '2026-11-08': { date: '2026-11-08', hours: 8, off: false }, '2026-11-09': null, '2026-11-13': null } }] }
    const csv = h.toCsv(report, { member: 'Member', total: 'Total', capacity: 'Capacity', dayTotal: 'Day total', off: 'Off', missing: 'Missing', dayHeading: d => d })
    ok(csv.startsWith('﻿'), 'a BOM, so Excel reads Arabic')
    ok(csv.includes('\r\n'), 'CRLF line ends')
    const lines = csv.slice(1).trim().split('\r\n')
    eq(lines[0], 'Member,2026-11-08,2026-11-09,2026-11-13,Total,Capacity', 'heading')
    eq(lines[1], '"رنا ""R"", Saeed",8,Missing,,8,40', 'quotes doubled; Friday empty, not Missing')
    eq(lines[2], 'Day total,8,0,0,8,', 'day totals')
  })
  await check('strings', async () => {
    const fs = await import('node:fs')
    const en = JSON.parse(fs.readFileSync(path.join(root, 'messages/en.json'), 'utf8')).hours
    const ar = JSON.parse(fs.readFileSync(path.join(root, 'messages/ar.json'), 'utf8')).hours
    const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, p + k + '.') : [p + k]))
    eq(keys(ar).sort(), keys(en).sort(), 'Arabic has every English key')
    const get = (o, k) => k.split('.').reduce((a, b) => a[b], o)
    for (const k of keys(en)) { new IntlMessageFormat(get(en, k), 'en'); new IntlMessageFormat(get(ar, k), 'ar') }
    eq(new IntlMessageFormat(ar.remind.more, 'ar').format({ n: 2 }), 'يومان آخران بلا تسجيل', 'Arabic dual')
  })
  return results
}
