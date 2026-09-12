/**
 * Every word of marketing copy on the site.
 *
 * Rev 01 of the "Sympathetic resonance" copy deck, applied 2026-09-09. The
 * previous build's prose was carried across verbatim from the old site; this
 * one replaces it string for string. Three rules govern edits here:
 *
 *   - Digits for anything countable. The digits are the argument.
 *   - Every listening sentence is paid for by a doing sentence in the same unit.
 *   - Nothing promises an outcome. Conduct is described; returns never are.
 *
 * "Resonance" appears exactly twice on this property (PHILOSOPHY.word and the
 * act 02 register). A third is parody. Banned families — guaranteed, protect
 * (near capital), custody, our fund, institutional-grade, track record,
 * vigilance, theatres, sentinel, exceptional, value creation — must not return.
 */

export const COMPANY = {
  name: "Guardian Holdings JSC",
  email: "office@guardianholdingsjsc.com",
  street: "Simeonovsko Shose 33, fl. 3",
  city: "Sofia",
  country: "Bulgaria",
  /** The office, not the city. 42.6977 / 23.3219 was Sofia's reference point
      (Dondukov Blvd, 5 km north of the door), printed under "Locate" beside
      the street address and declared as the schema geo. Geocoded from the
      address (OpenStreetMap, 2026-09-11). */
  lat: "42.6536",
  lon: "23.3364",
  coords: "42.6536° N · 23.3364° E",
  tz: "Europe/Sofia",
  /** Commercial Register (Търговски регистър) UIC / ЕИК. Bulgarian Commerce
      Act Art. 13 asks a trader's website to carry name, seat and UIC, and it
      is the one fact on the page a counterparty can check in a register. */
  uic: "208613644",
  /** Registration date, as the register gives it. */
  founded: "2025-12-12",
} as const;

export const META = {
  title: "Guardian Holdings JSC — private investment company, Sofia",
  description:
    "Guardian Holdings JSC is a private investment company in Sofia. Liquid markets, private equity, real estate. Capital for founders; 4 strategies for investors.",
  /** Schema.org description. Organization only — never FinancialService. */
  schema:
    "Guardian Holdings JSC is a private investment company in Sofia, Bulgaria, holding positions in liquid markets, private equity and real estate across 4 sectors.",
} as const;

/* ── 00 · CARRIER ─────────────────────────────────────────────────────── */
export const HERO = {
  words: ["Guardian", "Holdings"],
  /** Qualified legal name, category, city — the brand-collision fix, resolved
      before the title has finished decoding. Do not shorten. */
  standfirst: "Guardian Holdings JSC · Private investment company · Sofia",
  eyebrow: "3 asset classes // 4 sectors // 6 exchanges // No fifth sector",
  line: "Holdings is not a suffix. It is the job.",
  /** Both doors and their numbers, above the fold. Without this a founder and
      an investor both arrive and neither is addressed for another full act. */
  sub: "Capital and 6 operating functions for founders. 4 strategies for investors.",
  scrollCue: "See what we hold",
} as const;

/* ── 01 · UNIVERSE ────────────────────────────────────────────────────── */
export const UNIVERSE = {
  word: "Universe",
  kicker: "Investment universe",
  text: "Guardian Holdings JSC covers 3 asset classes and 4 sectors. Nothing outside them. That is very little, on purpose; a universe this narrow is one we can read cell by cell, and read again.",
  /** Every value is numeral-leading, because the counter animates it. */
  stats: [
    { value: "3", label: "Asset classes", note: "Liquid markets · Private equity · Real estate" },
    { value: "4", label: "Sectors", note: "Defence · Commodities · Tech · Financial services" },
    { value: "6", label: "Exchanges", note: "Read every trading day" },
    { value: "12", label: "Cells", note: "3 classes × 4 sectors" },
  ],
  matrix: {
    heading: "3 asset classes against 4 sectors. 12 cells; we cover all of them.",
    caption: "Guardian's investment universe: asset classes by sector",
    classes: ["Liquid markets", "Private equity", "Real estate"],
    sectors: ["Defence", "Commodities", "Tech", "Financial services"],
  },
} as const;

/* ── 02 · RESONANCE ───────────────────────────────────────────────────── */
/** The id stays `philosophy` — it is load-bearing in the field, the HUD and
    the anchor. Only the display word moved. */
export const PHILOSOPHY = {
  word: "Resonance",
  kicker: "How we read",
  statement:
    "We hear it while it is quiet, and we are still holding it when it is loud.",
  lede: "Most capital is in a hurry. Ours is not. We would rather read a business, a commodity cycle or a building slowly and act rarely than take a position on a story that broke last week.",
  /** One sentence, and one the principles below do not already say. The four
      it replaced were each said elsewhere: "very little, on purpose" and
      "nothing outside them" were the previous act's opener; the written case
      is in acts 03, 05, 06, 07 and 08; "the people who commit the capital show
      up" is act 05's close and act 08's third standing order. */
  body: "A position is taken when a business starts to move for the reasons we set out, and it is held until those reasons stop being true.",
  /** "Four" stays spelled here — a locked exception to the digits rule,
      because "4 principles" reads as a spec line. Do not "fix" it later. */
  principlesHeading: "Four principles we do not trade away.",
  principles: [
    {
      title: "Hear it early",
      line: "Every position starts as an observation. We follow a sector for years before we hold anything in it, so the terrain is known long before the money moves.",
    },
    {
      title: "Own what we understand",
      line: "Defence, Commodities, Tech, Financial services. There is no fifth. A sector we cannot explain in plain terms is one we do not hold, however well it is priced.",
    },
    {
      title: "Cross the asset classes",
      line: "Liquid markets, private equity and real estate are read on the same instrument. A signal in one decides a position in another. None of the three stands alone.",
    },
    {
      title: "Downside before upside",
      line: "Nothing compounds through a cycle it does not survive. The first bad year is priced into the case before we commit. Every case names what would make us wrong.",
    },
  ],
} as const;

/* ── 03 · PROCESS ─────────────────────────────────────────────────────── */
export const PROCESS = {
  word: "Process",
  kicker: "Process · 4 steps",
  heading: "One chain, and the last step is our own name.",
  lede: "The same 4 steps for a listed position, a minority stake or a building. What changes is the pace, not the order.",
  steps: [
    {
      name: "Sourcing",
      readout: "Hear",
      /** Not "Finance, Technology and Defence": those are the three DESKS,
          which the reader only meets at act 08. Two acts after the four
          sectors were named it read as a rival list with Commodities missing. */
      line: "We keep a network across all 4 sectors. We read the 6 exchanges every trading day. Most days we buy nothing.",
    },
    {
      name: "Analysis",
      readout: "Read",
      line: "Unit economics, governance and downside first; the case for growth second. Everything is written down before it is discussed.",
    },
    {
      name: "Execution",
      readout: "Commit",
      line: "Structure, terms and timing are agreed with founders and counterparties in one room. We move slowly until we move at once.",
    },
    {
      /** Renamed from "Management": portfolio management is the name of the
          regulated MiFID service, and it was sitting on a founder-facing act. */
      name: "Ownership",
      readout: "Hold",
      /** "The people who commit the capital show up afterwards" is act 08's
          third standing order, word for word, and act 05's close; it lives
          there. And it is every position, not two classes of three. */
      line: "Every position, listed, private or a building, is reviewed continuously, not quarterly, by the desk that committed it.",
    },
  ],
} as const;

/* ── 04 · READINGS ────────────────────────────────────────────────────── */
export const READINGS = {
  word: "Readings",
  kicker: "For founders · What we look for",
  /** "before we commit to it", not "before we hold any of it": act 06 names,
      as held, a licensed broker of military equipment and a law firm, which
      fail reading 001 on sight. The readings are what a founder is tested
      against, not a claim about every position on the book. */
  text: "We take 4 readings of a founder's business before we commit to it. Take them yourself first, on your own numbers. You already know the answers. If all 4 needles point the right way, write to us.",
  /** The act's one permitted conditional is spent in the text above. The four
      lines are conditional-free so they read as tests, not invitations. */
  items: [
    {
      title: "Online-first",
      line: "You sell, deliver and support online. A customer in another country buys exactly the same way.",
    },
    {
      title: "Scalable operations",
      line: "Your revenue grows faster than your payroll does. Twice the customers do not need twice the people.",
    },
    {
      title: "High growth potential",
      line: "Demand already outruns what you can serve. Capacity is the ceiling you keep hitting, not the market.",
    },
    {
      title: "Capital efficient",
      line: "You have grown this far on cash the business made itself. New money buys speed here, not survival.",
    },
  ],
} as const;

/* ── 05 · HANDS ───────────────────────────────────────────────────────── */
/** The id, anchor, HUD key and field state all stay `provide`. Only the
    display word moved. Every line here has a finite verb of work performed
    and none names a capability owned — listening that never becomes work is
    sentiment, and this act is what stops the whole concept collapsing into it. */
export const PROVIDE = {
  word: "Hands",
  kicker: "6 functions · One desk",
  text: "The money arrives with the hands to use it. Product, design, sales, people, infrastructure and finance sit at the desk that committed the capital. The same people show up on Monday.",
  functions: [
    {
      title: "Product & business analysis",
      line: "We cut the roadmap to what ships. Pricing and unit economics are written down before the meeting.",
      icon: "M4 4v16h16 M7.5 15.5l4-5 3 3 5.5-7 M20 6.5v3h-3",
    },
    {
      title: "Design & marketing",
      line: "We design the brand, build the interface and rewrite the landing pages once real traffic arrives.",
      icon: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 4v3 M12 17v3 M4 12h3 M17 12h3 M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
    },
    {
      /** We make introductions and sit in on calls; we never close them. A
          closed deal is not ours to claim, and a founder reads that in a second. */
      title: "BizDev & sales",
      line: "We make introductions in Defence, Commodities, Tech and Financial services, then sit in on the calls.",
      icon: "M12 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M5 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M19 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M11 7.7l-5 8.6 M13 7.7l5 8.6 M7 18h10",
    },
    {
      title: "HR & legal",
      line: "We write the job spec, screen the shortlist and bring counsel in before the contract is signed.",
      icon: "M12 4v16 M8 20h8 M5 8h14 M5 8l-2.5 6h5L5 8z M19 8l-2.5 6h5L19 8z",
    },
    {
      title: "IT & DevOps",
      line: "We review the architecture, harden the deploys and keep the infrastructure standing under load.",
      icon: "M4 5h16v5H4z M4 14h16v5H4z M7 7.5h.01 M7 16.5h.01 M14 7.5h3 M14 16.5h3",
    },
    {
      title: "Finance & strategy",
      line: "We build the model and take the raise apart before it goes out. We stay for the monthly close.",
      icon: "M4 20h4v-6h4v-5h4V4h4 M4 20V4 M4 20h16",
    },
  ],
} as const;

/* ── 06 · HELD ────────────────────────────────────────────────────────── */
/** The id stays `portfolio`. The readout counts CELLS, never positions — a
    number of holdings is an unpublished count, and it invites the question of
    what happened to the others.

    The plot names PRIVATE-EQUITY positions only. The liquid-market and
    real-estate books are held and covered but not itemised here, so the note
    and the empty state both say "named", never "held": a filter that returns
    no point must not be readable as a claim that nothing is held there. */
export const PORTFOLIO = {
  word: "Held",
  kicker: "Chart · Sector × Asset class",
  text: "A founder decides when their investor becomes public information. We do not announce it first. The names below are here because the people behind them cleared it. What each company does is on this page; how it is doing is theirs to say.",
  heading: "12 cells. Each name is plotted where it sits.",
  /** Without this the act is composed entirely of things we do not say, and
      restraint with no work behind it reads as evasion. */
  body: "A position starts with what the business earns, what it costs to run and what breaks it. Nothing is committed on a conversation.",
  namesHeading: "Names published with permission.",
  /** The "not itemised" caveat lives in `note` (visible) and `desc` (read
      aloud) and nowhere else; this used to be its third appearance. */
  namesLede: "Sector and class first; then the name, and what it does.",
  note: "Point positions are illustrative within each cell. The plot names private-equity positions; the liquid-market and real-estate books are covered, not itemised.",
  /** Deliberately "named", not "plotted": under a sector filter the liquid and
      real-estate rows return nothing, and "nothing held here" would be false. */
  empty: "No named position in this view.",
  desc: "A grid of 4 sector columns and 3 asset-class rows. Each plotted point is a named private-equity position; the liquid-market and real-estate books are covered but not itemised.",
  classes: ["Liquid markets", "Private equity", "Real estate"],
  sectors: ["Defence", "Commodities", "Tech", "Financial services"],
  /** ref (plot id and jitter seed), sector index (0-3), class index (0-2).
      Every line: what the company does, and why it sits in that cell. No
      metric, no valuation, no outcome, no date, and no count in this section. */
  companies: [
    {
      ref: "gds",
      short: "Guardian Defence",
      name: "Guardian Defence Systems",
      url: "https://guardiandefence.org",
      sector: 0,
      klass: 1,
      line: "Licensed supplier and broker of dual-use and military equipment, with unmanned systems developed in house.",
    },
    {
      ref: "proma",
      short: "Proma",
      name: "Proma OÜ",
      url: "",
      sector: 0,
      klass: 1,
      line: "Estonian software development house. The work is mainly defence, and that is the terrain we follow closest.",
    },
    {
      ref: "tpm",
      short: "Two Pillars",
      name: "Two Pillars Media",
      url: "https://twopillarsmedia.com",
      sector: 2,
      klass: 1,
      line: "Builds and runs the growth systems behind other online businesses: campaigns, content, and the platforms underneath.",
    },
    {
      ref: "apex",
      short: "Apex & Pillar",
      name: "Apex & Pillar",
      url: "https://apexpillar.org",
      sector: 2,
      klass: 1,
      line: "English-first Sofia law firm, with an IP and technology practice covering software, licensing and data.",
    },
    {
      ref: "eduhub",
      short: "EduHub",
      name: "EduHub.bg",
      url: "https://eduhub.bg",
      sector: 2,
      klass: 1,
      line: "An online school for the Bulgarian state exams: video lessons, practice tests and teacher-marked writing.",
    },
  ],
} as const;

/* ── 07 · MANDATE ─────────────────────────────────────────────────────── */
/** The id stays `advisory`. The display word moved off "Advisory" because it
    sits adjacent to *investment advice*, a named MiFID service this company
    does not perform. Every string here is written on one division of labour:
    Guardian defines the strategies; EU licensed investment intermediaries hold
    the account and carry out the mandate. */
export const ADVISORY = {
  word: "Mandate",
  kicker: "Mandate · Separately managed accounts",
  text: "Guardian Holdings JSC defines 4 strategies. Each runs under a discretionary mandate, in a single account. Nothing is pooled. The reading is ours; the account is not.",
  heading: "An account in your own name, read the way we read our own.",
  lede: "Every position in it is visible to you. The minimum is EUR 100,000, per account and per mandate; below that, the arrangement is not worth its own paperwork.",
  facts: [
    { value: "€100K", label: "Minimum investment", note: "Per account, per mandate" },
    /** "Strategies", not "Core strategies": "core" implies a periphery, and
        six lines down the heading says the list is closed. */
    { value: "4", label: "Strategies", note: "Alone or combined" },
    /** Previously named the Bulgarian supervisor. Naming a regulator beside
        Guardian's own name implies Guardian is the supervised entity. */
    { value: "EU", label: "Where it is held", note: "With a licensed intermediary" },
  ],
  strategiesHeading: "4 strategies. The list is closed.",
  strategiesLede: "A mandate runs one strategy, or a weighting across them. The list stays narrow on purpose. The weighting is written down before the account is opened. It is not changed by a phone call.",
  strategies: [
    {
      title: "Core Quality Equity",
      tag: "Equity · Long-term",
      line: "Businesses that generate their own cash and owe little, bought at a price that allows for a bad year. Held through the cycle, not the quarter.",
    },
    {
      title: "Strategic Activism & Special Situations",
      tag: "Event-driven",
      line: "Positions where a catalyst is already visible — a restructuring, a spin-off, a change of control. The written case comes before the position.",
    },
    {
      title: "Global Commodities & FX",
      tag: "Macro",
      line: "Directional and relative-value positions in commodities and major currencies. Read against the same 6 exchange sessions we watch for ourselves.",
    },
    {
      /** The illiquidity is in the tag and in the landing sentence, not buried:
          it is the one thing about this strategy an investor must know before
          the mandate is drafted, and a constraint stated plainly reads truer
          than the same fact found later. */
      title: "Private Equity",
      tag: "Private markets · Illiquid",
      line: "Direct positions in unlisted companies across the same 4 sectors. There is no daily price to sell.",
    },
  ],
  regulationHeading: "Who holds the account.",
  regulation:
    "We define the strategies. The account is opened with, and the mandate carried out by, EU licensed investment intermediaries. MiFID II names that service portfolio management: mandates carried out on a discretionary, client-by-client basis. Nothing in your account funds anything of ours.",
  /** Full size, its own block, never fine print. The last sentence names the
      actor: under MiFID the assessment is performed by the firm providing the
      service, so an actorless passive on Guardian's page reads as *we assess it*. */
  risk: "Capital placed under a mandate can be lost. Past performance is not a reliable indicator of what follows. Nothing on this page is an offer or a personal recommendation. Suitability is assessed by an EU licensed investment intermediary before a mandate is accepted.",
} as const;

/* ── 08 · THE WATCH ───────────────────────────────────────────────────── */
export const WATCH = {
  word: "The watch",
  kicker: "Team · Who keeps the watch",
  text: "Guardian Holdings JSC keeps 3 desks: Finance, Technology and Defence. We list the roster by post rather than by name. Nobody here holds a post they do not work. That is the whole credential.",
  heading: "3 desks. One watch.",
  lede: "We keep the watch from Sofia. Each desk below is listed by the posts it holds, not by the people who hold them. The same 3 standing orders bind every desk. A post is checkable; a biography is not.",
  /** Renamed from `theatres`: surveillance cosplay, and it reads worse, not
      better, next to a real Defence sector. */
  desks: [
    {
      name: "Finance",
      bearing: "000°",
      line: "Defines the 4 strategies the mandates are built on. Reads 6 exchanges through the session. Downside comes first, always. This is the desk that says no.",
      posts: ["Investment committee", "Strategy design", "Research & risk"],
    },
    {
      name: "Technology",
      bearing: "120°",
      line: "Staffs the 6 operating functions. Sits on the calls that follow an investment. Does the work a founder has no one on payroll for. The hands are here.",
      /** The six posts ARE the six functions of act 05, by name. The desk
          says it staffs them; a roster with three different names did not. */
      posts: ["Product & business analysis", "Design & marketing", "BizDev & sales", "HR & legal", "IT & DevOps", "Finance & strategy"],
    },
    {
      name: "Defence",
      bearing: "240°",
      /** A doing sentence in the middle: the other two desks each name work
          performed, and three listening verbs beside a licensed arms broker
          read as "where nobody can check". */
      line: "Follows a European sector where the public record moves slowly. Sits on the licensing and export questions a founder in it cannot afford to get wrong. Policy is read before price.",
      posts: ["Industry advisory", "Government & policy"],
    },
  ],
  ordersHeading: "How the watch is kept.",
  orders: [
    {
      title: "Read everything",
      line: "Every message to the company is read by a principal, not a mailbox.",
    },
    {
      title: "Write it down",
      line: "No position is taken and no founder is backed without a written case.",
    },
    {
      title: "Stay in the room",
      line: "The people who commit the capital are the people who show up afterwards.",
    },
  ],
} as const;

/* ── 09 · CHANNEL ─────────────────────────────────────────────────────── */
export const CHANNEL = {
  word: "Contact",
  text: "One address, read every day. Founders and investors write to the same one; the role you pick marks the message. Nothing is sorted or ranked on the way in.",
  formHeading: "Tell us what you are building, or what you want to hold.",
  /** Describes what Send DOES. It used to say "Send opens your mail client,
      addressed and written. Nothing leaves this page on its own." — true of the
      mailto-only form, false since the endpoint went live, and the worst
      possible claim to leave sitting under a box asking permission to keep the
      message. The mail-draft path still exists as the RECOVERY path, and the
      status line says so at the moment it happens; it does not belong here. */
  formNote:
    "Send delivers the message from this page. A copy reaches the address you gave, and the reply comes from the desk that read it.",
  roles: ["A founder", "An investor"],
  /** The site's one sanctioned question mark. */
  footerAsk: "Built something, and nobody has heard it yet?",
  footerPara:
    "Founders: tell us what you built and it reaches the people who invest and then do the work. Investors: the mandate, EUR 100,000, in your own name.",
  brandLine:
    "Guardian Holdings JSC is a private investment company in Sofia. We hold positions in liquid markets, private equity and real estate, across 4 sectors and nothing outside them.",
  /** The background recording is used under CC BY-SA 4.0, which requires
      attribution. THIS LINE IS THE ATTRIBUTION — it is a licence condition,
      not decoration, and it must not be cut while that recording ships. It
      renders only when a file is actually present in public/audio, so the
      credit and the thing it credits appear and vanish together.
      public/audio/LICENCE.txt holds the full terms and the source. */
  soundCredit: {
    text: "Sound · Mozart, Lacrimosa, transcribed by Thalberg. Performed by",
    /** Linked to the recording's own page: CC BY-SA 4.0 §3(a)(1)(A)(iv) asks
        for a link to the licensed material where practicable, and the credit
        used to link only to the licence. */
    performer: "Lệ Xuân",
    sourceHref: "https://commons.wikimedia.org/wiki/File:Mozart,_Requiem_in_D_minor,_%27Lacrimosa%27_%E2%80%93_piano_arrangement.ogg",
    licence: "CC BY-SA 4.0",
    href: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  /** Footer form of the canonical intermediary sentence — the legal name is
      already spent higher up the act. Plural when the class is the subject;
      never the definite singular, which points at one unnamed firm. */
  legal:
    "Guardian defines the strategies. EU licensed investment intermediaries hold the account and carry out the mandate.",
} as const;

/** Form state strings. Say what happened, then what to do, then stop.
    No apology, no emoji, no exclamation mark. */
export const FORM = {
  nameRequired: "A name is required.",
  emailRequired: "An email address is required.",
  /** The address is where the REPLY goes; a bad one does not stop the message
      reaching the desk. The Worker says the same words for the same fault. */
  emailInvalid: "A reply cannot reach that address.",
  /** No default role. Mirrored in the Worker for the no-JS POST. */
  roleRequired: "Say which you are: a founder or an investor.",
  messageRequired: "A message is required.",
  /** The consent tick. There is no cookie banner on this site by decision, so
      this box is the ONE place a visitor agrees to anything, and it covers only
      what they are sending here — not the analytics. Worded as what the company
      may do, because that is what is being agreed to. */
  consentLabel: "Guardian Holdings JSC may keep this message and my address in order to reply.",
  consentRequired: "Tick the box to send the message.",
  botCheck: "Complete the check under the message, then send.",
  sending: "Sending.",
  sent: "Sent. A reply comes to the address you gave.",
  /** The send failed, so the form opens the mail draft rather than losing what
      the visitor typed. The line names both halves: what broke, what follows. */
  sendFailed: "That did not send. A mail draft is opening instead.",
  mailOpened: "The message is prepared in your mail client. Press send there.",
  mailFailed: `Your mail client did not open. The address is ${COMPANY.email}.`,
} as const;

/** Act manifest — the HUD index and the field's morph states both read this.
    Each label matches that act's display word on screen: a reader who sees
    HELD in the readout and PORTFOLIO on the page has caught the instrument
    lying. The ids are load-bearing and never change. */
export const ACTS = [
  /** The hero has no opener; its display words are "Guardian" / "Holdings",
      so the readout says the first of them. "Carrier" was on no screen. */
  { id: "carrier", label: "Guardian" },
  { id: "universe", label: "Universe" },
  { id: "philosophy", label: "Resonance" },
  { id: "process", label: "Process" },
  { id: "readings", label: "Readings" },
  { id: "provide", label: "Hands" },
  { id: "portfolio", label: "Held" },
  { id: "advisory", label: "Mandate" },
  { id: "watch", label: "The watch" },
  { id: "channel", label: "Contact" },
] as const;

export const ACT_COUNT = ACTS.length;
