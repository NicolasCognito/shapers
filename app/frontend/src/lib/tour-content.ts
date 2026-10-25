// Texts of the interactive tour, one copy per language. Each step points at
// an element marked with data-tour="…" (see components/tour.tsx).

export type TourStepText = { title: string; text: string }

export type TourContent = {
  next: string
  prev: string
  done: string
  progress: string // "{{current}} of {{total}}"
  button: string // sidebar button
  welcomeMember: TourStepText
  welcomeAdmin: TourStepText
  timer: TourStepText
  thisWeek: TourStepText
  meetings: TourStepText
  rules: TourStepText
  navTasks: TourStepText
  navRequests: TourStepText
  navTree: TourStepText
  navMe: TourStepText
  teamTiles: TourStepText
  teamAttention: TourStepText
  tabMembers: TourStepText
  tabAttendance: TourStepText
  adminRequests: TourStepText
  navBoard: TourStepText
  jarvis: TourStepText
  tryIt: string
  memberAsks: string[]
  adminAsks: string[]
}

const en: TourContent = {
  next: "Next",
  prev: "Back",
  done: "Done",
  progress: "{{current}} of {{total}}",
  button: "Take the tour",
  welcomeMember: {
    title: "Welcome to Shapers 👋",
    text: "A one-minute tour of the few things you'll use every week. You can replay it any time from the menu.",
  },
  welcomeAdmin: {
    title: "Welcome, admin 👋",
    text: "A one-minute tour of how to see the whole team, record attendance and answer requests.",
  },
  timer: {
    title: "Work timer",
    text: "Pick a plan and press start when you begin. Pause when you step away (paused time doesn't count), then stop and log the hours in one click.",
  },
  thisWeek: {
    title: "Your week",
    text: "Hours against your tier's weekly goal; the marker shows where you should be by today. Log in seconds with +0.5h … +8h. Older dates become a request to the admins.",
  },
  meetings: {
    title: "Meetings",
    text: "Clock in from 30 min before a meeting. Can't make it? Press “Can't come” and give a reason: the team sees it in Slack. GO!: 72 h ahead for Community, 24 h for the rest.",
  },
  rules: {
    title: "Pause & Community rules",
    text: "Exams or travel? Ask for a pause: those weeks aren't “behind” and keep your streak. Here you also see how many Community meetings you can still miss.",
  },
  navTasks: {
    title: "My tasks",
    text: "Every task assigned to you, across all projects. Finish it, change priority or date, or hand it to someone; it stays yours until they accept.",
  },
  navRequests: {
    title: "Requests",
    text: "Everything waiting for someone's yes: older hours, pauses, task handoffs. Answers come with a reason.",
  },
  navTree: {
    title: "My Tree",
    text: "Finish a planned session or meet your weekly goal to earn water. Keep it green.",
  },
  navMe: {
    title: "Your own week",
    text: "As a member too, you log hours and clock in from My week, the same as everyone.",
  },
  teamTiles: {
    title: "The organisation at a glance",
    text: "Hours this week against the total goal, how many are behind pace, average attendance and tasks done.",
  },
  teamAttention: {
    title: "Who needs a nudge",
    text: "Members behind on hours who also miss meetings, worst first. Click a name for the full picture.",
  },
  tabMembers: {
    title: "Every member",
    text: "Sort and filter by tier. ⏸ means on pause, “Community ⚠” a broken Community rule. Click a row for history, to set a pause or to cancel a finished task with a reason.",
  },
  tabAttendance: {
    title: "Attendance in one go",
    text: "Pick a meeting, mark everyone and save once. Self check-ins and “can't come” notices are already filled in.",
  },
  adminRequests: {
    title: "Requests",
    text: "Older hours and pause requests land here. Approve, or reject with a reason the member will see.",
  },
  navBoard: {
    title: "Board",
    text: "All projects. “Create Project” is one step and the whole team joins at once. Assign tasks to anyone.",
  },
  jarvis: {
    title: "Jarvis does the rest",
    text: "Your assistant, on every page. Tap the mic and just say it: it logs hours, tells the team you can't come, asks for a pause, creates and assigns tasks, and opens the right page.",
  },
  tryIt: "Try one:",
  memberAsks: [
    "How many hours do I still need this week?",
    "I worked 2 hours on the website yesterday",
    "When is my next meeting?",
    "What are my open tasks?",
  ],
  adminAsks: [
    "Who is falling behind this week?",
    "Which meeting series has the worst attendance?",
    "Open the Team page",
  ],
}

const sl: TourContent = {
  next: "Naprej",
  prev: "Nazaj",
  done: "Končano",
  progress: "{{current}} od {{total}}",
  button: "Ogled aplikacije",
  welcomeMember: {
    title: "Dobrodošli v Shapers 👋",
    text: "Enominutni ogled stvari, ki jih boste uporabljali vsak teden. Kadarkoli ga ponovite iz menija.",
  },
  welcomeAdmin: {
    title: "Dobrodošli, skrbnik 👋",
    text: "Enominutni ogled: kako vidite celo ekipo, beležite prisotnost in odgovarjate na zahtevke.",
  },
  timer: {
    title: "Časovnik",
    text: "Izberite načrt in pritisnite start. Ob odmoru dajte na premor (ta čas se ne šteje), nato ustavite in zapišite ure z enim klikom.",
  },
  thisWeek: {
    title: "Vaš teden",
    text: "Ure glede na tedenski cilj vašega nivoja; oznaka pokaže, kje bi morali biti danes. Zapišite v sekundah z +0.5h … +8h. Starejši datumi postanejo zahtevek skrbnikom.",
  },
  meetings: {
    title: "Sestanki",
    text: "Prijava od 30 min pred sestankom. Ne morete priti? Pritisnite »Ne morem priti« in napišite razlog: ekipa ga vidi na Slacku. GO!: 72 h prej za Community, 24 h za ostale.",
  },
  rules: {
    title: "Premor in pravila Community",
    text: "Izpiti ali potovanje? Zaprosite za premor: ti tedni niso »zaostanek« in ohranijo serijo. Tukaj vidite tudi, koliko Community sestankov lahko še zamudite.",
  },
  navTasks: {
    title: "Moje naloge",
    text: "Vse vaše naloge v vseh projektih. Zaključite, spremenite prioriteto ali rok ali jo predajte; vaša ostane, dokler je prejemnik ne sprejme.",
  },
  navRequests: {
    title: "Zahtevki",
    text: "Vse, kar čaka na nečij »da«: starejše ure, premori, predaje nalog. Odgovori imajo razlog.",
  },
  navTree: {
    title: "Moje drevo",
    text: "Zaključite načrtovano sejo ali dosezite tedenski cilj in dobite vodo. Naj ostane zeleno.",
  },
  navMe: {
    title: "Vaš teden",
    text: "Tudi kot član ure zapisujete in se prijavljate na sestanke v Mojem tednu, kot vsi.",
  },
  teamTiles: {
    title: "Organizacija na prvi pogled",
    text: "Ure ta teden glede na skupni cilj, koliko jih zaostaja, povprečna prisotnost in opravljene naloge.",
  },
  teamAttention: {
    title: "Kdo potrebuje spodbudo",
    text: "Člani, ki zaostajajo z urami in manjkajo na sestankih, najhujše najprej. Klik na ime pokaže vse.",
  },
  tabMembers: {
    title: "Vsak član",
    text: "Razvrščajte in filtrirajte po nivoju. ⏸ pomeni premor, »Community ⚠« kršeno pravilo. Klik na vrstico: zgodovina, nastavitev premora, preklic naloge z razlogom.",
  },
  tabAttendance: {
    title: "Prisotnost naenkrat",
    text: "Izberite sestanek, označite vse in shranite enkrat. Samoprijave in napovedi izostanka so že izpolnjene.",
  },
  adminRequests: {
    title: "Zahtevki",
    text: "Sem pridejo starejše ure in prošnje za premor. Odobrite ali zavrnite z razlogom, ki ga član vidi.",
  },
  navBoard: {
    title: "Tabla",
    text: "Vsi projekti. »Ustvari projekt« je en korak in vsa ekipa se pridruži naenkrat. Naloge dodelite komurkoli.",
  },
  jarvis: {
    title: "Jarvis naredi ostalo",
    text: "Vaš pomočnik na vsaki strani. Tapnite mikrofon in povejte: zapiše ure, sporoči ekipi, da ne pridete, zaprosi za premor, ustvari in dodeli naloge ter odpre pravo stran.",
  },
  tryIt: "Poskusite:",
  memberAsks: [
    "Koliko ur mi še manjka ta teden?",
    "Včeraj sem 2 uri delal na spletni strani",
    "Kdaj je moj naslednji sestanek?",
    "Katere naloge imam odprte?",
  ],
  adminAsks: [
    "Kdo zaostaja ta teden?",
    "Katera serija sestankov ima najslabšo prisotnost?",
    "Odpri stran Ekipa",
  ],
}

export function tourContent(lang: string): TourContent {
  return lang.startsWith("sl") ? sl : en
}
