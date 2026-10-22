// tblib.js: helpers evaluated in Thunderbird's chrome context before each scenario step.
// They drive the CalDAV provider through the same item APIs the task dialog uses.
const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
const { CalAlarm } = ChromeUtils.importESModule("resource:///modules/CalAlarm.sys.mjs");
const { CalDuration } = ChromeUtils.importESModule("resource:///modules/CalDuration.sys.mjs");

function otCal() {
  return cal.manager.getCalendars().find(c => c.name == "OpenTodo");
}

async function otSetup(url, user, pw) {
  const origin = Services.io.newURI(url).prePath;
  // Replace any saved login for the server, so a new app password is used.
  for (const l of await Services.logins.searchLoginsAsync({ origin })) Services.logins.removeLogin(l);
  const LoginInfo = Components.Constructor("@mozilla.org/login-manager/loginInfo;1", Ci.nsILoginInfo, "init");
  await Services.logins.addLoginAsync(new LoginInfo(origin, null, "OpenTodo CalDAV", user, pw, "", ""));
  let c = otCal();
  if (!c) {
    c = cal.manager.createCalendar("caldav", Services.io.newURI(url));
    c.name = "OpenTodo";
    c.setProperty("cache.enabled", false);
    cal.manager.registerCalendar(c);
  }
  return c;
}

function otRefresh(c) {
  return new Promise(resolve => {
    const obs = {
      QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
      onStartBatch() {}, onEndBatch() {}, onAddItem() {}, onModifyItem() {}, onDeleteItem() {},
      onError() {}, onPropertyChanged() {}, onPropertyDeleting() {},
      onLoad() { c.removeObserver(obs); resolve(); },
    };
    c.addObserver(obs);
    c.refresh();
    setTimeout(() => { c.removeObserver(obs); resolve(); }, 15000);
  });
}

async function otItems(c) {
  const filter = Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;
  return c.getItemsAsArray(filter, 0, null, null);
}

async function otFind(c, title) {
  const items = await otItems(c);
  return items.find(i => i.title == title);
}

function dt(s, tz) {
  // "20261025" (date), "20261025T090000" (floating), with tz a zoned time.
  const d = cal.createDateTime(s);
  if (tz) d.timezone = cal.timezoneService.getTimezone(tz);
  else if (s.length > 8) d.timezone = cal.dtz.floating;
  return d;
}

function summary(i) {
  if (!i) return null;
  const alarms = i.getAlarms().map(a => ({ related: a.related, offset: a.offset && a.offset.icalString, abs: a.alarmDate && a.alarmDate.icalString, action: a.action }));
  return {
    title: i.title,
    entry: i.entryDate && (i.entryDate.icalString + (i.entryDate.isDate ? " date" : "") + " " + i.entryDate.timezone.tzid),
    due: i.dueDate && (i.dueDate.icalString + (i.dueDate.isDate ? " date" : "") + " " + i.dueDate.timezone.tzid),
    completed: i.isCompleted,
    status: i.status,
    rrule: i.recurrenceInfo ? i.recurrenceInfo.getRecurrenceItems().map(r => r.icalString.trim()) : null,
    alarms,
    estimate: i.getProperty("ESTIMATED-DURATION"),
    ics: i.icalString,
  };
}
