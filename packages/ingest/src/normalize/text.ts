const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  ocirc: 'ô',
  icirc: 'î',
  ucirc: 'û',
  ugrave: 'ù',
  euro: '€',
  szlig: 'ß',
  oslash: 'ø',
  aelig: 'æ',
  bdquo: '„',
  sbquo: '‚',
};

/** Accented-letter entities (&aacute;, &Otilde;, &uuml;…) are a letter plus a combining mark. */
const ENTITY_MARKS: Record<string, string> = {
  acute: '\u0301',
  grave: '\u0300',
  circ: '\u0302',
  tilde: '\u0303',
  uml: '\u0308',
  ring: '\u030A',
  cedil: '\u0327',
  caron: '\u030C',
};
const ACCENT_ENTITY = /^([a-z])(acute|grave|circ|tilde|uml|ring|cedil|caron)$/i;

export function decodeEntities(input: string): string {
  // Some feeds escape twice and lose the "&" ("Gibranamp;nbsp;"); restore it first.
  return input.replace(/(?<!&)amp;(?=#?\w+;)/g, '&').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const [, letter, mark] = ACCENT_ENTITY.exec(body) ?? [];
    if (letter && mark) return (letter + ENTITY_MARKS[mark.toLowerCase()]).normalize('NFC');
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Strip tags, decode entities, collapse whitespace. A literal `<![CDATA[…]]>`
 * (Excélsior and Correio da Manhã escape their CDATA sections, so they reach
 * us as text) is unwrapped first; otherwise the tag pattern would swallow the
 * whole title.
 */
export function stripHtml(input: string): string {
  return decodeEntities(
    input
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Truncate at a word boundary, appending an ellipsis if anything was cut. */
export function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  const cut = input.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s.,;:!?–—-]+$/, '')}…`;
}

/** Clean a feed-provided snippet: plain text, ~maxChars, null if empty. */
export function cleanDescription(raw: string | undefined | null, maxChars: number): string | null {
  if (!raw) return null;
  const text = stripHtml(raw);
  return text ? truncate(text, maxChars) : null;
}

export function cleanTitle(raw: string): string {
  return stripHtml(raw);
}

/** Lower-case, strip accents (NFD + drop combining marks), turn punctuation into spaces. */
export function foldText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    // Soft hyphens and zero-width characters sit inside words (Vísir: "Guð­mundur").
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
    .toLowerCase()
    // Turkish dotless ı has no decomposition; fold it so "IĞDIR" and "Iğdır" match.
    .replace(/ı/g, 'i')
    // Greek final sigma: "εκλογές" and "εκλογέσ" are the same word.
    .replace(/ς/g, 'σ')
    .replace(/[’'`]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Accent-folded, so they match folded tokens.
const STOPWORDS_FR = `
a au aux avec ce ces cet cette dans de des du elle elles en et eux il ils je la le les leur leurs lui
ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sont sur ta
te tes toi ton tu un une vos votre vous c d j l m n s t y ete etre est sont fait faire plus moins
apres avant selon sans sous chez entre contre comme tout tous toute toutes tres aussi encore deja
quand ont avait sera seront peut doit va vont ca cela ceci celui celle dont alors donc car si non oui
voici voila depuis pendant lors vers fois rien`;

const STOPWORDS_EN = `
a an the and or but if of at by for with about against between into through during before after
above below to from up down in out on off over under again further then once here there when where
why how all any both each few more most other some such no nor not only own same so than too very
can will just should now is are was were be been being have has had having do does did doing
i me my we our you your he him his she her it its they them their what which who whom this that
these those am would could says said say new amid vs`;

// Umlauts fold to the bare vowel (für → fur). Kept out of the FR/EN set on
// purpose: "die", "war", "man", "dies" and "hat" are real English words.
const STOPWORDS_DE = `
der die das den dem des ein eine einer einem einen eines und oder aber doch sondern als wie wenn weil
dass ob zu zum zur im in ins am an auf aus bei mit nach von vor uber unter um durch fur gegen ohne
bis seit wahrend ab ich du er sie es wir ihr ihm ihn ihnen sich sein seine ihre ihren ihrem unser
nicht kein keine keinen auch noch schon nur sehr mehr so da dann hier dort jetzt nun wieder immer
ist sind war waren wird werden wurde wurden worden hat haben hatte hatten sei kann konnen soll sollen
muss mussen will wollen darf alle alles viel viele dieser diese dieses diesem diesen jeder jede was wer
wo warum wieso man neue neuer neuen neues erst ersten gibt geht laut heute mal`;

const STOPWORDS_ES = `
el la los las lo un una unos unas y o u e ni pero sino que de del al a en con por para sin sobre
entre hasta desde hacia contra segun tras ante bajo como cuando donde quien quienes cual cuales
se su sus le les me te nos os mi mis tu tus yo el ella ellos ellas usted ustedes este esta estos
estas ese esa esos esas aquel aquella esto eso es son fue fueron ser sera seran ha han hay habia
haber estar esta estan era eran muy mas menos ya no si tambien todo toda todos todas otro otra
otros otras mismo misma tras durante cada asi aun nuevo nueva nuevos nuevas ultima hora directo
dice dicen`;

const STOPWORDS_IT = `
il lo la i gli le un uno una di a da in con su per tra fra del dello della dei degli delle al allo
alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla
sui sugli sulle e ed o ma anche se che chi cui non piu meno come dove quando perche quale quali
questo questa questi queste quello quella quelli quelle suo sua suoi sue loro mi ti ci vi si ne
lui lei noi voi essi e sono era erano stato stata stati essere ha hanno aveva avere fa fare dopo
prima ancora gia solo tutto tutti tutta tutte molto poi cosa ecco oggi nuovo nuova ora diretta`;

const STOPWORDS_PT = `
o a os as um uma uns umas e ou mas que de do da dos das em no na nos nas ao aos a as pelo pela pelos
pelas por para com sem sobre entre ate apos contra desde se seu sua seus suas ele ela eles elas
lhe isso isto esse essa este esta esses essas aquele aquela nao sim mais menos muito ja ainda
tambem como quando onde quem qual quais e sao foi foram ser sera ter tem tinha ha diz dizem
apos novo nova novos novas ao vivo agora hoje veja saiba leia confira entenda`;

// Turkish suffixes split off by an apostrophe ("Erdoğan'ın" → erdogan + in) are listed too,
// as are light verbs (etti, yaptı) and police-blotter formula words ("operasyon: 26
// gözaltı"), which otherwise merged unrelated raids and visits on 2026-10-06.
const STOPWORDS_TR = `
ve ile bir bu su o da de ki mi mu icin gibi ama ancak fakat veya ya ne daha cok en cok olan olarak
oldu olacak olan olur sonra once kadar uzere her hem ise diye dedi soyledi yeni son dakika canli
in un nin nun ya ye ta te dan den tan ten yi yu la le na ne nda nde ndan nden yla yle
etti edildi eden etmek yapti yapildi yapilan aldi alindi verdi kimdir nedir
operasyon operasyonu gozalti gozaltina gozaltinda tutuklandi tutuklama supheli`;

// Format markers that say nothing about the story ("EN DIRECT", "LIVE UPDATES", "VIDEO", "LIVE-TICKER").
// Japanese is matched on kanji bigrams and katakana words (see japaneseTokens), so
// its stopwords are those units: news-site labels and the most generic bigrams.
const STOPWORDS_JA = `
速報 動画 写真 独自 中継 詳報 更新 解説 一覧 発表 記者 会見 午前 午後 今日 明日 昨日 去年 今年 来年
ニュース ライブ まとめ
`;

// Dutch (Netherlands and Flanders), with weekdays and months.
const STOPWORDS_NL = `
de het een en of maar want dus dat die dit deze van in op aan met voor door bij naar over uit om tot als
dan ook nog wel niet geen te er hij zij ze wij we jij je u ik zijn is was waren wordt worden werd werden
heeft hebben had hadden kan kunnen zal zullen moet moeten wil willen gaat gaan meer meest veel alle al
nieuw nieuwe eerste na onder tegen zonder sinds tijdens hoe wat wie waar waarom wanneer zo nu hier daar
mee toe weer jaar jaren dag vandaag gisteren morgen maandag dinsdag woensdag donderdag vrijdag zaterdag
zondag januari februari maart april mei juni juli augustus september oktober november december
`;

// Scandinavian and Polish lists are folded like the tokens: å, ä, ö, ó, ś… lose
// their marks, but ø, æ and ł have no decomposition and stay. "Several" (flera,
// flere) is listed: "flera skadade" merged two unrelated Swedish bus crashes.
const STOPWORDS_SV = `
och i att det som en pa ar av for med till den har de inte om ett han men var jag sig fran vi sa kan
man nar ar sager efter upp ut nu ska skulle vill eller hon nya ny under mot over far blir blev bli sedan
ocksa alla flera nagra in vid da dar hur vad vem varfor idag igar imorgon mandag tisdag onsdag torsdag fredag lordag
sondag januari februari mars april maj juni juli augusti september oktober november december
`;
const STOPWORDS_NB = `
og i a det som en pa er av for med til den har de ikke om et han men var jeg seg fra vi sa kan man nar
ar sier etter opp ut na skal skulle vil eller hun nye ny under mot over far blir ble bli siden ogsa
alle flere noen inn ved da der her hvordan hva hvem hvorfor dag gar mandag tirsdag onsdag torsdag fredag lørdag
søndag januar februar mars april mai juni juli august september oktober november desember
`;
const STOPWORDS_DA = `
og i at det som en pa er af for med til den har de ikke om et han men var jeg sig fra vi sa kan man nar
ar siger efter op ud nu skal skulle vil eller hun nye ny under mod over far bliver blev blive siden ogsa
alle flere nogle ind ved da der her hvordan hvad hvem hvorfor dag gar mandag tirsdag onsdag torsdag fredag lørdag
søndag januar februar marts april maj juni juli august september oktober november december
`;
const STOPWORDS_PL = `
i w na z do sie ze nie to jest o od po za co jak ale dla jako przez przy ten ta te tym tego tej byc byl
byla bylo sa bedzie moze juz jeszcze tylko tez oraz lub czy a by bo gdy kiedy gdzie ktory ktora ktore
ktorych ich jego jej nas was ma maja roku rok lat dzis dzisiaj wczoraj jutro pod nad bez we nowy nowe
nowa poniedziałek wtorek sroda czwartek piatek sobota niedziela stycznia lutego marca kwietnia czerwca
lipca sierpnia wrzesnia pazdziernika listopada grudnia
`;

// Czech and Romanian diacritics (č, ř, ě, ů; ă, î, ș, ț) all decompose, so these
// lists are plain ASCII.
const STOPWORDS_CS = `
a i v ve na se s z ze do k ke o od po za pro pri je jsou byl byla bylo byli bude budou to ten ta te
tento tato toto ktery ktera ktere kteri jak ale aby by kdyz kde co uz jeste jen take nebo ani podle
pred pres mezi bez nad pod jeho jeji jejich nas vas ma maji muze mohou chce dnes vcera zitra rok roku
let novy nova nove pondeli utery streda ctvrtek patek sobota nedele ledna unora brezna dubna kvetna
cervna cervence srpna zari rijna listopadu prosince rekl rekla uvedl
`;
const STOPWORDS_RO = `
si in la cu de pe din pentru al ale ai o un unei unui care ce cum cand unde este sunt era fost fi va
vor au mai nu se sa isi lui ei lor ca dar sau ori dupa inainte despre prin intre fara sub peste acest
aceasta acesti aceste acum azi astazi ieri maine luni marti miercuri joi vineri sambata duminica
ianuarie februarie martie aprilie iunie iulie august septembrie octombrie noiembrie decembrie anul ani
nou noua noi primul prima
`;

// Central/Eastern European, Baltic, Finnish and Greek lists, all folded like the
// tokens (marks stripped, final ς → σ; đ, ł, ø stay). These languages inflect
// heavily, so lists are short and clustering leans on names and places.
const STOPWORDS_SK = `
a i v vo na sa s z zo do k ku o od po za pre pri je su bol bola bolo boli bude budu to ten ta tento
tato toto ktory ktora ktore ako ale aby by ked kde co uz este len tiez alebo ani podla pred cez medzi
bez nad pod jeho jej ich nas vas ma maju moze chce dnes vcera zajtra rok roku rokov novy nova nove
pondelok utorok streda stvrtok piatok sobota nedela januara februara marca aprila maja juna jula
augusta septembra oktobra novembra decembra
`;
const STOPWORDS_HU = `
a az es egy hogy nem is meg de mar csak mint vagy van volt lesz lett lehet kell ez ezt azt ami aki
ahol amikor mert itt ott most ma tegnap holnap ev eves uj utan elott alatt felett szerint miatt kozott
ellen nelkul ki mit mi hol mikor miert minden sok tobb se sem pedig illetve hetfo kedd szerda csutortok
pentek szombat vasarnap januar februar marcius aprilis majus junius julius augusztus szeptember oktober
november december
`;
const STOPWORDS_FI = `
ja on ei se oli olla ovat ole etta kun jos mutta tai myos vain nyt kuin kanssa jo viela mita miten
miksi missa kuka joka jotka tama nama han he me ne sen sita siita ennen jalkeen mukaan vuonna vuoden
vuotta uusi uuden tanaan eilen huomenna eika voi saa sai tulee kertoo maanantai tiistai keskiviikko
torstai perjantai lauantai sunnuntai tammikuu helmikuu maaliskuu huhtikuu toukokuu kesakuu heinakuu
elokuu syyskuu lokakuu marraskuu joulukuu
`;
const STOPWORDS_ET = `
ja on ei see oli olla olid et kui aga voi ka ainult nuud kes mis mida kuidas miks kus need tema nad
meie ta seda selle parast enne jarel aasta aastal uus uue tana eile homme sai saab tuleb ning
esmaspaev teisipaev kolmapaev neljapaev reede laupaev puhapaev jaanuar veebruar marts aprill mai
juuni juuli august september oktoober november detsember
`;
const STOPWORDS_LV = `
un ir ar par no uz pie bet vai ka kas kur kad ja ne ari tikai jau vel vins vina vini tas ta to tie sis
si pec pirms bez lidz starp gads gada gadu jauns jauna sodien vakar rit bija bus var tiek tika
pirmdiena otrdiena tresdiena ceturtdiena piektdiena sestdiena svetdiena janvari februari marta aprili
maija junija julija augusta septembri oktobri novembri decembri
`;
const STOPWORDS_LT = `
ir in i ar bet kad kaip kur kas ka tai tas ta jis ji jie jos jo su be uz nuo po pries per apie del
tarp iki taip pat jau dar tik ne yra buvo bus gali metu metai nauja naujas siandien vakar rytoj
pirmadieni antradieni treciadieni ketvirtadieni penktadieni sestadieni sekmadieni sausio vasario kovo
balandzio geguzes birzelio liepos rugpjucio rugsejo spalio lapkricio gruodzio
`;
// Croatian, Serbian and Bosnian (Latin script) share one list.
const STOPWORDS_HR_SR = `
i u na je su se da za od s sa o po do iz kao ali ili a sto koji koja koje kojeg koju kada gdje gde
kako zasto ne nije nisu bio bila bilo biti ce ovo taj ta to te ovaj ova ove nakon prije pre bez nad
pod između protiv jos samo vec danas jucer juce sutra godine godina novi nova novo on ona oni ga mu
im ponedjeljak ponedeljak utorak srijeda sreda cetvrtak petak subota nedjelja nedelja sijecnja veljace
ozujka travnja svibnja lipnja srpnja kolovoza rujna listopada studenog prosinca januara februara
marta aprila maja juna jula avgusta septembra oktobra novembra decembra
`;
// Slovenian and Icelandic are written in normal spelling and folded by
// foldedWords (Icelandic ð, þ and æ have no decomposition and stay as they are).
const STOPWORDS_SL = `
in v na je so se da za od z s o po do iz kot ali pa a ki kaj ko kje kako zakaj ne ni niso bil bila
bilo biti bo bodo to ta te ti tega tem pred brez nad pod med proti tudi še samo že danes včeraj jutri
leta leto let novi nova novo on ona oni ga mu jim jih ob pri ponedeljek torek sreda četrtek petek
sobota nedelja januarja februarja marca aprila maja junija julija avgusta septembra oktobra novembra
decembra
`;
const STOPWORDS_IS = `
og í á af til um frá með við er var eru voru verður hefur hafa hafði sem að ekki en eða því þá þar
þetta þessi hann hún þeir þær þau það hans hennar eftir fyrir undir yfir milli gegn líka bara nú nýr
ný nýtt dag gær morgun mánudag þriðjudag miðvikudag fimmtudag föstudag laugardag sunnudag janúar
febrúar mars apríl maí júní júlí ágúst september október nóvember desember
`;
// Russian, Macedonian and Albanian are written in normal spelling and folded by
// foldedWords (ё → е, й → и, ќ → к, ѓ → г, ë → e, ç → c).
const STOPWORDS_RU = `
и в во не что он она оно они на с со как а то все всё так его её их но да к у же вы за бы по только
мне было вот от меня ещё нет о об из ему когда даже ли если уже или ни быть был была были будет
до где есть для мы чем без под при после над через про эти этот эта это того этого этом между также
может могут более менее который которая которые которых году года год лет сегодня вчера завтра
заявил заявила заявили сообщил сообщила сообщили понедельник вторник среда четверг пятница суббота
воскресенье среду пятницу субботу января февраля марта апреля мая июня июля августа сентября октября ноября декабря
`;
const STOPWORDS_MK = `
и во на е се да за од со ќе не што кој која кое кои како но или а по до при меѓу без над под пред
против уште само веќе денес вчера утре година години нов нова ново нови тој таа тие го му ги им ја
бил била било биле има нема дека понеделник вторник среда четврток петок сабота недела јануари
февруари март април мај јуни јули август септември октомври ноември декември
`;
const STOPWORDS_SQ = `
e të në për me një dhe nga që i u se do ka kanë është janë ishte ishin nuk pa si por edhe më pas
para mbi kundër deri tek te sot dje nesër ky kjo këto këta ata ajo ai saj tij tyre vit viti vitin
ku kur çfarë hënë martë mërkurë enjte premte shtunë diel janar shkurt mars prill maj qershor korrik
gusht shtator tetor nëntor dhjetor
`;
// Indonesian and Vietnamese (folded by foldedWords; Vietnamese loses its tones,
// so e.g. "nam" covers year, south and five: all too common to be useful).
const STOPWORDS_ID = `
yang di ke dari dan untuk dengan ini itu dalam pada akan tidak ada juga sudah atau oleh karena saat
bagi para kepada telah bisa jadi masih lebih hari kemarin besok usai jelang soal kata sebut begini
senin selasa rabu kamis jumat sabtu minggu januari februari maret april mei juni juli agustus
september oktober november desember tahun
`;
const STOPWORDS_VI = `
của và các những cho với trong không được là có người một đã sẽ này đến từ theo về khi tại sau trước
năm ngày tháng hôm nay qua vào ra lên bị thì mà như để cũng còn rất nhiều đang vừa thứ hai ba tư
sáu bảy chủ nhật việt nam
`;
// Chinese bigrams that are reporting boilerplate rather than story content.
const STOPWORDS_ZH = `今日 今天 昨天 昨日 明天 明日 表示 指出 記者 報導 报道 快訊 快讯 影音 直播 獨家 独家 最新 新聞 新闻`;
// Armenian, Azerbaijani and Uzbek (Latin), folded by foldedWords. Uzbek is
// written after titleTokens drops the apostrophe in oʻ/gʻ ("boʻldi" → "boldi").
const STOPWORDS_HY = `
և ու է են էր էին եմ ես ենք որ ի մեջ համար հետ այս այդ այն նա իր իրենց մի մեկ չի չեն ոչ թե բայց կամ
դեպի մասին ըստ պետք արդեն նաև այսօր երեկ վաղը տարի տարվա ով ինչ ինչու ինչպես երբ որտեղ շատ ավելի
երկուշաբթի երեքշաբթի չորեքշաբթի հինգշաբթի ուրբաթ շաբաթ կիրակի հունվարի փետրվարի մարտի ապրիլի
մայիսի հունիսի հուլիսի օգոստոսի սեպտեմբերի հոկտեմբերի նոյեմբերի դեկտեմբերի տեսանյութ լուսանկարներ
`;
const STOPWORDS_AZ = `
və ilə üçün bu bir da də ki olan olub olunub edib edir etdi isə ən daha artıq haqqında sonra əvvəl
qədər görə bugün dünən sabah il ilin ildə tarixində yanvar fevral mart aprel may iyun iyul avqust
sentyabr oktyabr noyabr dekabr bazar ertəsi çərşənbə axşamı cümə şənbə foto
`;
const STOPWORDS_UZ = `
va bilan uchun bu bir ham esa haqida kuni yil yilda yilning yili oy soat bugun kecha ertaga qilindi
boldi boladi emas ekan kabi uning ular ularning edi yanvar fevral mart aprel may iyun iyul avgust
sentabr oktabr noyabr dekabr dushanba seshanba chorshanba payshanba juma shanba yakshanba foto
`;
// Persian, folded by foldedWords like titles (آ → ا, ZWNJ dropped: "سه‌شنبه" → "سهشنبه").
// "ایران" is in every other title, like "việt nam" above; "قیمت" (price) heads the
// daily gold, currency and fare listings.
const STOPWORDS_FA = `
و در به از که این با را برای آن است شد می شود شده کرد کرده کند های ها یک تا بر هم نیز اما یا پس
پیش خود او آنها ما ایران امروز دیروز فردا سال روز ماه شنبه یکشنبه دوشنبه سه‌شنبه چهارشنبه پنجشنبه
جمعه فروردین اردیبهشت خرداد تیر مرداد شهریور مهر آبان آذر دی بهمن اسفند گفت اعلام خبر ویدئو فیلم
عکس قیمت
`;
// Nepali keeps its vowel signs (see indicTokens), so this list is not folded.
const STOPWORDS_NE = `
र को का की मा ले लाई बाट छ छन् हो भएको गरेको गर्न पनि यो त्यो एक भने गर्ने हुने थियो सम्म लागि
साथ आज हिजो भोलि वर्ष साल आइतबार सोमबार मंगलबार बुधबार बिहीबार शुक्रबार शनिबार बैशाख जेठ असार
साउन भदौ असोज कात्तिक मंसिर पुस माघ फागुन चैत भिडियो तस्बिर
`;
// Hebrew, checked after hebrewTokens strips a one-letter prefix from longer
// words. "ישראל" is in every other title, like "ایران" above.
const STOPWORDS_HE = `
של את על עם זה זו זאת לא כי גם אבל או מה מי איך למה כל יותר אחרי לפני בין אל הוא היא הם הן אני
אנחנו יש אין היה היתה היום אתמול מחר שנה שנים ישראל ראשון שני שלישי רביעי חמישי שישי שבת צפו
תיעוד בלעדי
`;
// Korean syllable pairs (see koreanTokens) that are newsroom labels, not content.
const STOPWORDS_KO = `속보 종합 단독 포토 영상 오늘 내일 어제 기자 사진`;
// Thai words as Intl.Segmenter splits them (see thaiTokens).
const STOPWORDS_TH = `
ที่ และ ใน ของ ให้ ได้ เป็น มี ไม่ จาก กับ ว่า แล้ว จะ คน การ ความ วัน นี้ ล่าสุด ไป มา อยู่ ถึง หลัง
ก่อน เพื่อ โดย ยัง ต่อ ด้วย ทั้ง เมื่อ หรือ แต่ อีก ปี เดือน
`;
// Bengali keeps its vowel signs (see indicTokens), so this list is not folded.
const STOPWORDS_BN = `
এবং এর না কে করে হয়েছে থেকে জন্য বলে সঙ্গে একটি আজ নিয়ে দিয়ে করা হবে হয় ছিল তার তিনি এই সেই
বা আর কি কী যে পর আগে মধ্যে দিকে বছর ভিডিও ছবি
`;
// Somali: particles and pronoun clusters (oo, ayaa, lagu …), "daawo" = watch, and
// the country's own name, which nearly every headline carries.
const STOPWORDS_SO = `
oo ka iyo ku u la in ay ee soo ah ayaa kala uga loo lagu laga waxaa waxay inay inuu ugu kaga si kale
ahaa ayuu ayay kadib kaddib dib kuna kana kasoo kusoo isla aan aad ama mid hal sida maanta shalay
daawo sawirro muuqaal warbixin degdeg soomaaliya somalia
`;
// Swahili and Kinyarwanda: connectives and class-agreement particles (ya, wa, za …;
// Kinyarwanda's elided n' z' cy' leave one- and two-letter tokens), plus the country's name.
const STOPWORDS_SW = `
na ya wa kwa katika la za cha vya kwenye ni pia hii hiyo huo hizo yake wake zake baada kabla kuhusu
kati bila zaidi hadi tangu leo jana kesho sasa ili kama lakini au ndani nje kuwa ana wana mpya video
picha habari tanzania
`;
const STOPWORDS_RW = `
na ya mu ku wa ba kuri muri ni no nk bya rya kwa iki ibi aba uyu iyi ubu kandi nyuma mbere ndetse bari
yari ari ko uko ngo u i y z n c cy by ry rw bw kw rwanda
`;
// Kyrgyz and Belarusian, written in normal spelling and folded by foldedWords.
const STOPWORDS_KY = `
жана менен үчүн боюнча деп бул ал да дагы бир мен биз алар эмес бар жок болот болгон болуп кийин
чейин дейт айтты жылы жыл бүгүн кечээ тууралуу каршы аркылуу ошол андан кандай эмне ким качан кайда
млн млрд сом сомду сомдон түздү кыргызстан
`;
const STOPWORDS_BE = `
і ў у на з за па да ад не што як але гэта ці а для пра пасьля пасля праз яго яе іх быў была былі будзе
ужо таксама сёньня сёння учора дзе калі пры без над пад паміж
`;
// Cyrillic й folds to и (NFD), hence "маи".
const STOPWORDS_BG = `
и в на за от с да се не е са по до при към като че но или ще бил била било това този тази тези които
който която което как къде кога защо след преди без над под между срещу също още само вече днес вчера
утре година години нов нова нови ги го му я им понеделник вторник сряда четвъртък петък събота неделя
януари февруари март април маи юни юли август септември октомври ноември декември
`;
const STOPWORDS_EL = `
και να το τα του τησ των τον την ο η οι σε στο στη στην στον στα στισ στουσ με για απο που θα δεν
μη μην ειναι ηταν εχει εχουν ενα μια ενασ ωσ αλλα ομωσ οτι πωσ μετα πριν κατα προσ χωρισ μεχρι οπωσ
αυτο αυτη αυτοσ αυτα ολα νεο νεα νεοσ σημερα χθεσ αυριο δευτερα τριτη τεταρτη πεμπτη παρασκευη
σαββατο κυριακη ιανουαριου φεβρουαριου μαρτιου απριλιου μαιου ιουνιου ιουλιου αυγουστου
σεπτεμβριου οκτωβριου νοεμβριου δεκεμβριου βιντεο
`;

// Arabic, passed through arabicTokens like the titles. Includes Gregorian and
// Levantine month names and "breaking"/"video" labels.
const STOPWORDS_AR = `
في من على الى عن مع هذا هذه ذلك تلك التي الذي الذين ان او ثم بعد قبل حتى عند بين كل غير منذ خلال حول
ضد نحو كان كانت يكون قد لا ما لم لن هو هي هم له لها لهم به بها فيه فيها عليه عليها منه منها اليه
تم يتم قال قالت يقول اول جديد جديده يوم امس غدا عام اثنين ثلاثاء اربعاء خميس جمعه سبت احد
يناير فبراير مارس ابريل مايو يونيو يوليو اغسطس سبتمبر اكتوبر نوفمبر ديسمبر كانون تشرين شباط اذار
نيسان ايار حزيران تموز اب ايلول عاجل فيديو صور بالفيديو بالصور مباشر
`;

// Calendar words in service headlines ("¿A qué hora juega…? hoy martes 6 de octubre",
// "dólar blue hoy") merged unrelated Argentine stories on 2026-10-06.
const CALENDAR_ES = `
hoy ayer manana lunes martes miercoles jueves viernes sabado domingo enero febrero marzo abril
mayo junio julio agosto septiembre setiembre octubre noviembre diciembre hora horas cuanto
`;
// Same for French dated columns: "Nécrologie du 06 octobre 2026" and "Tir en
// l'air du 06 octobre 2026" (Madagascar) merged on {06, octobre} on 2026-10-06.
const CALENDAR_FR = `
aujourd aujourdhui hui hier demain lundi mardi mercredi jeudi vendredi samedi dimanche janvier
fevrier mars avril mai juin juillet aout septembre octobre novembre decembre
`;
const CALENDAR_PT = `
hoje ontem amanha segunda terca quarta quinta sexta sabado domingo feira janeiro fevereiro marco
abril maio junho julho agosto setembro outubro novembro dezembro
`;

const BOILERPLATE = `direct live video videos photo photos watch updates update podcast replay liveblog ticker newsblog`;

const wordSet = (...lists: string[]) => new Set(lists.flatMap((list) => list.split(/\s+/)).filter(Boolean));
const foldedWords = (list: string) => foldText(list);

/**
 * Stopwords per feed language. English is included everywhere: wire-style
 * English words turn up in every country's titles ("live", "update").
 */
const STOPWORDS_FR_EN = wordSet(STOPWORDS_FR, STOPWORDS_EN, BOILERPLATE);
const STOPWORDS_BY_LANGUAGE: Record<string, Set<string>> = {
  fr: wordSet(STOPWORDS_FR, CALENDAR_FR, STOPWORDS_EN, BOILERPLATE),
  en: STOPWORDS_FR_EN,
  de: wordSet(STOPWORDS_DE, STOPWORDS_EN, BOILERPLATE),
  es: wordSet(STOPWORDS_ES, CALENDAR_ES, STOPWORDS_EN, BOILERPLATE),
  it: wordSet(STOPWORDS_IT, STOPWORDS_EN, BOILERPLATE),
  pt: wordSet(STOPWORDS_PT, CALENDAR_PT, STOPWORDS_EN, BOILERPLATE),
  tr: wordSet(STOPWORDS_TR, STOPWORDS_EN, BOILERPLATE),
  ja: wordSet(STOPWORDS_JA, STOPWORDS_EN, BOILERPLATE),
  nl: wordSet(STOPWORDS_NL, STOPWORDS_EN, BOILERPLATE),
  sv: wordSet(STOPWORDS_SV, STOPWORDS_EN, BOILERPLATE),
  nb: wordSet(STOPWORDS_NB, STOPWORDS_EN, BOILERPLATE),
  da: wordSet(STOPWORDS_DA, STOPWORDS_EN, BOILERPLATE),
  pl: wordSet(STOPWORDS_PL, STOPWORDS_EN, BOILERPLATE),
  cs: wordSet(STOPWORDS_CS, STOPWORDS_EN, BOILERPLATE),
  ro: wordSet(STOPWORDS_RO, STOPWORDS_EN, BOILERPLATE),
  sk: wordSet(STOPWORDS_SK, STOPWORDS_EN, BOILERPLATE),
  hu: wordSet(STOPWORDS_HU, STOPWORDS_EN, BOILERPLATE),
  fi: wordSet(STOPWORDS_FI, STOPWORDS_EN, BOILERPLATE),
  et: wordSet(STOPWORDS_ET, STOPWORDS_EN, BOILERPLATE),
  lv: wordSet(STOPWORDS_LV, STOPWORDS_EN, BOILERPLATE),
  lt: wordSet(STOPWORDS_LT, STOPWORDS_EN, BOILERPLATE),
  hr: wordSet(STOPWORDS_HR_SR, STOPWORDS_EN, BOILERPLATE),
  sr: wordSet(STOPWORDS_HR_SR, STOPWORDS_EN, BOILERPLATE),
  bs: wordSet(STOPWORDS_HR_SR, STOPWORDS_EN, BOILERPLATE),
  so: wordSet(STOPWORDS_SO, STOPWORDS_EN, BOILERPLATE),
  sw: wordSet(STOPWORDS_SW, STOPWORDS_EN, BOILERPLATE),
  rw: wordSet(STOPWORDS_RW, STOPWORDS_EN, BOILERPLATE),
  ky: wordSet(foldedWords(STOPWORDS_KY), STOPWORDS_EN, BOILERPLATE),
  be: wordSet(foldedWords(STOPWORDS_BE), STOPWORDS_EN, BOILERPLATE),
  ko: wordSet(STOPWORDS_KO, STOPWORDS_EN, BOILERPLATE),
  th: wordSet(STOPWORDS_TH, STOPWORDS_EN, BOILERPLATE),
  bn: wordSet(STOPWORDS_BN, STOPWORDS_EN, BOILERPLATE),
  he: wordSet(STOPWORDS_HE, STOPWORDS_EN, BOILERPLATE),
  fa: wordSet(foldedWords(STOPWORDS_FA), STOPWORDS_EN, BOILERPLATE),
  ne: wordSet(STOPWORDS_NE, STOPWORDS_EN, BOILERPLATE),
  hy: wordSet(foldedWords(STOPWORDS_HY), STOPWORDS_EN, BOILERPLATE),
  az: wordSet(foldedWords(STOPWORDS_AZ), STOPWORDS_EN, BOILERPLATE),
  uz: wordSet(foldedWords(STOPWORDS_UZ), STOPWORDS_EN, BOILERPLATE),
  id: wordSet(foldedWords(STOPWORDS_ID), STOPWORDS_EN, BOILERPLATE),
  vi: wordSet(foldedWords(STOPWORDS_VI), STOPWORDS_EN, BOILERPLATE),
  zh: wordSet(STOPWORDS_ZH, STOPWORDS_EN, BOILERPLATE),
  ru: wordSet(foldedWords(STOPWORDS_RU), STOPWORDS_EN, BOILERPLATE),
  mk: wordSet(foldedWords(STOPWORDS_MK), STOPWORDS_EN, BOILERPLATE),
  sq: wordSet(foldedWords(STOPWORDS_SQ), STOPWORDS_EN, BOILERPLATE),
  sl: wordSet(foldedWords(STOPWORDS_SL), STOPWORDS_EN, BOILERPLATE),
  is: wordSet(foldedWords(STOPWORDS_IS), STOPWORDS_EN, BOILERPLATE),
  bg: wordSet(STOPWORDS_BG, STOPWORDS_EN, BOILERPLATE),
  el: wordSet(STOPWORDS_EL, STOPWORDS_EN, BOILERPLATE),
  // Normalized the same way as titles, so the list can be written in plain spelling.
  ar: new Set([...arabicTokens(STOPWORDS_AR), ...wordSet(STOPWORDS_EN, BOILERPLATE)]),
};

const HAN = /\p{Script=Han}/u;
const KANA_OR_HAN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;

/**
 * Japanese has no spaces between words, so a title is cut into script runs:
 * kanji runs become overlapping bigrams (石破首相 → 石破, 破首, 首相), katakana
 * runs stay whole (loanwords and foreign names), hiragana runs (particles,
 * verb endings) are dropped, and Latin/digit runs are kept as words. Dakuten
 * are kept (NFKC, not foldText's NFD + mark stripping), so バス ≠ パス.
 */
function japaneseTokens(title: string): string[] {
  const text = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  const out: string[] = [];
  const runs = /\p{Script=Han}+|[\p{Script=Katakana}ー]+|\p{Script=Hiragana}+|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu;
  for (const [run] of text.matchAll(runs)) {
    if (HAN.test(run)) {
      for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
    } else if (/^[\p{Script=Katakana}ー]+$/u.test(run)) {
      if (run.length >= 2) out.push(run);
    } else if (!KANA_OR_HAN.test(run)) {
      out.push(...foldText(run).split(' '));
    }
  }
  return out;
}

/**
 * Chinese is all Han characters, so it uses the Japanese splitter (overlapping
 * bigrams), after cutting runs at grammatical characters (的, 了, 是, 在…) so
 * that bigrams like 的新 don't count as shared content.
 */
function chineseTokens(title: string): string[] {
  return japaneseTokens(title.replace(/[的了是在和與与及也都就將将被把對对為为於于之其又並并]/g, ' '));
}

/**
 * Arabic words carry the article and clitics as prefixes (الحكومة, والحكومة,
 * للحكومة are all "the government"), and spelling varies in hamza and final
 * letters. Each word is normalized (alef forms → ا, ة → ه, ى → ي, tatweel
 * and diacritics dropped, Arabic-Indic digits → ASCII), then one prefix of
 * the article (ال with an optional و ف ب ك, or لل) is stripped if a stem of
 * at least three letters remains. Single-letter و/ب/ل prefixes are left: too
 * many roots start with those letters (وزير, بيان, لجنة).
 */
function arabicTokens(title: string): string[] {
  // foldText's NFD also splits hamza off ؤ and ئ (رئيس → رييس), consistently.
  const text = foldText(
    title
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/\u0640/g, '')
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
      .replace(/\u0629/g, '\u0647')
      .replace(/\u0649/g, '\u064A'),
  );
  return text.split(' ').map((w) => {
    const m = /^(?:[وفبك]?ال|لل)(.{3,})$/u.exec(w);
    return m ? m[1]! : w;
  });
}

/**
 * Persian: Arabic ي and ك become Persian ی and ک (outlets mix them), Persian and
 * Arabic-Indic digits become ASCII, tatweel is dropped; foldText does the rest.
 */
function persianTokens(title: string): string[] {
  return foldText(
    title
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/\u064A/g, '\u06CC')
      .replace(/\u0643/g, '\u06A9')
      .replace(/\u0640/g, ''),
  ).split(' ');
}

/**
 * Korean words carry their particles (대통령이, 대통령은, 대통령과), so each
 * Hangul word is split into overlapping syllable pairs, as for Japanese
 * kanji. Hangul must not go through foldText: NFD splits syllables into jamo.
 */
function koreanTokens(title: string): string[] {
  const out: string[] = [];
  for (const [run] of title.normalize('NFC').toLowerCase().matchAll(/\p{Script=Hangul}+|[^\s\p{Script=Hangul}]+/gu)) {
    if (/\p{Script=Hangul}/u.test(run)) {
      if (run.length === 1) continue;
      for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
    } else {
      out.push(...foldText(run).split(' '));
    }
  }
  return out;
}

/**
 * Thai has no spaces between words; ICU's dictionary-based word segmenter
 * (Intl.Segmenter, built into Node) splits them. Tone and vowel marks are
 * kept: they distinguish words.
 */
const THAI_SEGMENTER = new Intl.Segmenter('th', { granularity: 'word' });
function thaiTokens(title: string): string[] {
  const text = title.normalize('NFC').replace(/[\u0E50-\u0E59]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
  return [...THAI_SEGMENTER.segment(text)]
    .filter((seg) => seg.isWordLike)
    .flatMap((seg) => (/\p{Script=Thai}/u.test(seg.segment) ? [seg.segment] : foldText(seg.segment).split(' ')));
}

/**
 * Hebrew: acronyms keep their gershayim (", ״ or '') as one word (צה"ל → צהל),
 * and one prefix letter (ו ה ב ל מ ש כ: and, the, in, to, from, that, as) is
 * dropped from words of five letters or more, so ונתניהו and נתניהו match.
 * Words that merely start with those letters lose it too, consistently.
 */
function hebrewTokens(title: string): string[] {
  const text = foldText(title.replace(/(?<=\p{Script=Hebrew})["״'׳]+(?=\p{Script=Hebrew})/gu, ''));
  return text.split(' ').map((w) => (/^[ובלהמשכ]\p{Script=Hebrew}{4,}$/u.test(w) ? w.slice(1) : w));
}

/**
 * Devanagari and Bengali vowel signs and viramas are combining marks, so
 * foldText would strip them and leave bare consonants (नेपाल → नपल) that
 * collide. Keep marks; only digits are converted and zero-width joiners dropped.
 */
function indicTokens(title: string): string[] {
  return title
    .normalize('NFC')
    .replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
    .split(' ');
}

/**
 * Crude suffix folding, not real stemming: drops a plural s/x, then a final
 * e, so "inscrites"/"inscrits", "lycees"/"lycee" and "charges"/"charge" match.
 * Short tokens are left alone to avoid collisions.
 */
export function stem(token: string, language?: string): string {
  let t = token;
  // German and Dutch plurals and inflections: Grünen/Grüne, Parteien/Partei,
  // Wahlen/Wahl, verkiezingen/verkiezing.
  if ((language === 'de' || language === 'nl') && t.length > 5 && t.endsWith('en')) t = t.slice(0, -2);
  if (t.length > 4 && /[^s][sx]$/.test(t)) t = t.slice(0, -1);
  if (t.length > 4 && t.endsWith('e')) t = t.slice(0, -1);
  return t;
}

/** Normalized token set for title similarity. `language` picks the stopword list (default: French + English). */
export function titleTokens(title: string, language?: string): Set<string> {
  const stopwords = (language && STOPWORDS_BY_LANGUAGE[language]) || STOPWORDS_FR_EN;
  const tokens = new Set<string>();
  // Uzbek outlets write oʻ/gʻ with ʻ, ' or ’; drop the mark inside words so they agree.
  if (language === 'uz') title = title.replace(/(?<=\p{L})[ʻʼ'’‘`](?=\p{L})/gu, '');
  const words =
    language === 'ja'
      ? japaneseTokens(title)
      : language === 'zh'
        ? chineseTokens(title)
        : language === 'ar'
          ? arabicTokens(title)
          : language === 'he'
            ? hebrewTokens(title)
            : language === 'fa'
            ? persianTokens(title)
            : language === 'ne' || language === 'bn'
              ? indicTokens(title)
              : language === 'ko'
                ? koreanTokens(title)
                : language === 'th'
                  ? thaiTokens(title)
              : foldText(title).split(' ');
  for (const raw of words) {
    if (!raw || stopwords.has(raw)) continue;
    if (raw.length < 2 && !/\d/.test(raw)) continue;
    // Years carry almost no signal: "Cartas a Quito / 6 de octubre de 2026" and
    // "Portada del 6 de octubre de 2026" merged on {6, 2026} on 2026-10-06.
    // Only 20xx: "1906 presos" is a count, not a year. Persian titles use the
    // Solar Hijri year (1405), which merged gold and flight prices "۱۴ مهر ۱۴۰۵".
    if (/^20\d\d$/.test(raw) || (language === 'fa' && /^14\d\d$/.test(raw))) continue;
    tokens.add(stem(raw, language));
  }
  return tokens;
}
