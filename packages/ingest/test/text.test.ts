import { describe, expect, it } from 'vitest';
import { cleanDescription, decodeEntities, foldText, stripHtml, titleTokens, truncate } from '../src/normalize/text';

describe('foldText', () => {
  it('treats French accents as equivalent', () => {
    expect(foldText('Élysée')).toBe('elysee');
    expect(foldText('Élysée')).toBe(foldText('elysee'));
    expect(foldText('ÇA BOUGE à Noël, où ?')).toBe('ca bouge a noel ou');
  });

  it('turns punctuation and apostrophes into spaces', () => {
    expect(foldText("L’Assemblée : «vote» d'urgence!")).toBe('l assemblee vote d urgence');
  });
});

describe('titleTokens', () => {
  it('drops FR and EN stopwords and folds accents', () => {
    expect([...titleTokens("Le Premier ministre à l'Élysée")]).toEqual(['premier', 'ministr', 'elyse']);
    expect([...titleTokens('The Senate votes on the budget')]).toEqual(['senat', 'vote', 'budget']);
    expect(titleTokens('votes')).toEqual(titleTokens('vote'));
  });

  it('matches accented and unaccented spellings', () => {
    expect(titleTokens('Élysée')).toEqual(titleTokens('elysee'));
  });

  it('matches singular/plural and masculine/feminine forms', () => {
    expect(titleTokens('personnes inscrites')).toEqual(titleTokens('personne inscrit'));
    expect(titleTokens('lycéens blessés')).toEqual(titleTokens('lyceen blesse'));
  });

  it('drops live-blog boilerplate', () => {
    expect(titleTokens('EN DIRECT – Grève SNCF')).toEqual(titleTokens('Grève SNCF'));
  });
});

describe('titleTokens: per-language stopwords', () => {
  it('drops German stopwords and folds umlauts for de', () => {
    expect([...titleTokens('Die Zahl der Verweigerer steigt für den Wehrdienst', 'de')]).toEqual([
      'zahl',
      'verweigerer',
      'steigt',
      'wehrdienst',
    ]);
  });

  it('keeps English words that are German stopwords', () => {
    // "dies" and "war" are stopwords in German, but carry the story in English.
    expect([...titleTokens('Former speaker dies at 84', 'en')]).toContain('dies');
    expect([...titleTokens('War in Sudan enters third year', 'en')]).toContain('war');
    expect([...titleTokens('Former speaker dies at 84')]).toContain('dies');
  });

  it('drops Spanish stopwords and live-blog markers for es', () => {
    expect([...titleTokens('Sánchez adelanta las elecciones al 29 de noviembre', 'es')]).toEqual([
      'sanchez',
      'adelanta',
      'eleccion',
      '29',
    ]);
    expect(titleTokens('Última hora: elecciones generales, en directo', 'es')).toEqual(
      titleTokens('elecciones generales', 'es'),
    );
  });

  it('drops Italian stopwords for it', () => {
    expect([...titleTokens('Il governo pone la fiducia sugli articoli della legge elettorale', 'it')]).toEqual([
      'governo',
      'pone',
      'fiducia',
      'articoli',
      'legg',
      'elettoral',
    ]);
  });

  it('drops Portuguese stopwords and "veja/saiba" list markers for pt', () => {
    expect(titleTokens('Veja quem são os deputados estaduais eleitos', 'pt')).toEqual(
      titleTokens('deputados estaduais eleitos', 'pt'),
    );
  });

  it('folds Turkish letters, including dotless ı, and apostrophe suffixes for tr', () => {
    expect(titleTokens("Erdoğan'ın IĞDIR ziyareti", 'tr')).toEqual(titleTokens('Erdogan Iğdır ziyareti', 'tr'));
    expect([...titleTokens("Son dakika: Meclis'te bütçe görüşmeleri başladı", 'tr')]).toEqual([
      'mecli', // the generic plural-s fold applies; harmless as it's consistent
      'butc',
      'gorusmeleri',
      'basladi',
    ]);
  });

  it('ignores Turkish light verbs and police-blotter formula words', () => {
    // Two different raids on 2026-10-06 that used to merge on "suç örgütüne operasyon: N gözaltı".
    expect(titleTokens('Daltonlar suç örgütüne operasyon: 26 gözaltı', 'tr')).toEqual(
      titleTokens('Daltonlar suç örgütüne 26', 'tr'),
    );
    expect(titleTokens('Cumhurbaşkanı Erdoğan AileFest’i ziyaret etti', 'tr').has('etti')).toBe(false);
  });

  it('folds German -en inflections', () => {
    expect(titleTokens('Grünen Parteien Wahlen', 'de')).toEqual(titleTokens('Grüne Partei Wahl', 'de'));
  });
});

describe('titleTokens: calendar words', () => {
  it('ignores weekdays, months and "today" in Spanish and Portuguese', () => {
    expect(titleTokens('Dólar blue hoy: a cuánto cotiza este martes 6 de octubre', 'es')).toEqual(
      new Set(['dolar', 'blue', 'cotiza', '6']),
    );
    expect(titleTokens('Greve marcada para hoje, terça-feira', 'pt')).toEqual(new Set(['grev', 'marcada']));
  });
});

describe('titleTokens: Dutch', () => {
  it('drops Dutch stopwords and folds -en plurals', () => {
    expect(titleTokens('Kabinet valt na ruzie over de verkiezingen', 'nl')).toEqual(
      titleTokens('Ruzie over verkiezing: kabinet valt', 'nl'),
    );
    expect(titleTokens('Het kabinet is gevallen', 'nl').has('het')).toBe(false);
  });
});

describe('titleTokens: Scandinavian and Polish', () => {
  it('drops stopwords after folding, keeping ø and ł', () => {
    expect(titleTokens('Regeringen säger nej till förslaget på måndag', 'sv')).toEqual(
      titleTokens('Regeringen: nej till förslaget', 'sv'),
    );
    expect(titleTokens('Stortinget stemmer over budsjettet på søndag', 'nb').has('søndag')).toBe(false);
    expect(titleTokens('Folketinget har vedtaget loven i dag', 'da').has('har')).toBe(false);
    expect(titleTokens('Sejm przyjął ustawę, która będzie obowiązywać', 'pl')).toEqual(
      new Set(['sejm', 'przyjał', 'ustaw', 'obowiazywac']),
    );
  });
});

describe('titleTokens: Czech and Romanian', () => {
  it('drops stopwords after folding diacritics', () => {
    expect(titleTokens('Vláda schválila rozpočet, který bude platit od ledna', 'cs').has('ktery')).toBe(false);
    expect(titleTokens('Vláda schválila rozpočet', 'cs')).toEqual(new Set(['vlada', 'schvalila', 'rozpocet']));
    expect(titleTokens('Guvernul a aprobat bugetul pentru anul viitor', 'ro').has('pentru')).toBe(false);
    expect(titleTokens('Președintele în vizită la București', 'ro')).toEqual(
      titleTokens('Presedintele vizita Bucuresti', 'ro'),
    );
  });
});

describe('titleTokens: Greek, Bulgarian and other new lists', () => {
  it('folds Greek tonos and final sigma, and drops stopwords', () => {
    expect(titleTokens('Οι εκλογές στην Αθήνα', 'el')).toEqual(titleTokens('ΕΚΛΟΓΕΣ ΑΘΗΝΑ', 'el'));
    expect(titleTokens('Οι εκλογές στην Αθήνα', 'el').has('στην')).toBe(false);
  });
  it('drops Bulgarian, Hungarian, Finnish and Croatian/Serbian stopwords', () => {
    expect(titleTokens('Правителството ще приеме бюджета в май', 'bg').has('маи')).toBe(false);
    expect(titleTokens('Правителството ще приеме бюджета в май', 'bg').has('ще')).toBe(false);
    expect(titleTokens('A kormány szerint nem lesz adóemelés', 'hu').has('szerint')).toBe(false);
    expect(titleTokens('Hallitus kertoo että vero nousee', 'fi').has('etta')).toBe(false);
    expect(titleTokens('Vlada je danas usvojila zakon', 'hr')).toEqual(titleTokens('Vlada usvojila zakon', 'sr'));
  });
});

describe('titleTokens: Slovenian and Icelandic', () => {
  it('folds and drops Slovenian stopwords', () => {
    expect(titleTokens('Vlada je včeraj sprejela proračun', 'sl')).toEqual(titleTokens('Vlada sprejela proracun', 'sl'));
  });
  it('ignores soft hyphens inside words', () => {
    expect(titleTokens('Guð­mundur opnar setur', 'is')).toEqual(titleTokens('Guðmundur opnar setur', 'is'));
  });
  it('drops Icelandic stopwords and keeps ð/þ', () => {
    const tokens = titleTokens('Þingið samþykkti fjárlögin í gær', 'is');
    expect(tokens.has('i')).toBe(false);
    expect(tokens.has('gær')).toBe(false);
    expect([...tokens].some((t) => t.startsWith('þing'))).toBe(true);
  });
});

describe('titleTokens: Russian, Macedonian and Albanian', () => {
  it('folds ё/й and drops Russian stopwords', () => {
    expect(titleTokens('Токаев подписал закон о налогах в среду', 'ru')).toEqual(new Set(['токаев', 'подписал', 'закон', 'налогах']));
    expect(titleTokens('Её слёзы', 'ru')).toEqual(titleTokens('ее слезы', 'ru'));
  });
  it('drops Macedonian stopwords and folds ќ', () => {
    expect(titleTokens('Владата ќе донесе одлука денес', 'mk')).toEqual(new Set(['владата', 'донесе', 'одлука']));
  });
  it('drops Albanian stopwords and folds ë', () => {
    expect(titleTokens('Kuvendi miratoi buxhetin për vitin 2027', 'sq')).toEqual(new Set(['kuvendi', 'miratoi', 'buxhetin']));
  });
});

describe('titleTokens: Chinese, Indonesian and Vietnamese', () => {
  it('splits Chinese into bigrams, cutting at grammatical characters', () => {
    expect([...titleTokens('立法院通過了預算', 'zh')].sort()).toEqual(['法院', '立法', '院通', '通過', '預算'].sort());
  });
  it('drops Indonesian stopwords', () => {
    expect(titleTokens('Presiden Prabowo resmikan bendungan di Jawa Tengah hari ini', 'id')).toEqual(
      new Set(['presiden', 'prabowo', 'resmikan', 'bendungan', 'jawa', 'tengah']),
    );
  });
  it('folds Vietnamese tones and drops stopwords', () => {
    expect(titleTokens('Quốc hội thông qua luật đất đai', 'vi')).toEqual(titleTokens('Quoc hoi thong qua luat đat đai', 'vi'));
    expect(titleTokens('Quốc hội thông qua luật', 'vi').has('qua')).toBe(false);
  });
});

describe('titleTokens: Armenian, Azerbaijani and Uzbek', () => {
  it('drops Armenian stopwords', () => {
    expect(titleTokens('Կառավարությունը հաստատել է բյուջեն այսօր', 'hy')).toEqual(new Set(['կառավարությունը', 'հաստատել', 'բյուջեն']));
  });
  it('folds Azerbaijani and drops stopwords', () => {
    expect(titleTokens('Prezident İlham Əliyev Bakıda görüş keçirib və danışıb', 'az')).toEqual(
      titleTokens('Prezident Ilham Əliyev Bakida gorus kecirib danisib', 'az'),
    );
    expect(titleTokens('Bu gün Bakıda', 'az').has('bu')).toBe(false);
  });
  it('makes Uzbek oʻ/gʻ spellings agree', () => {
    expect(titleTokens('Fargʻona shahrida yangi boʻlim ochildi', 'uz')).toEqual(titleTokens("Farg'ona shahrida yangi bo’lim ochildi", 'uz'));
    expect(titleTokens('Toshkentda yangi bino boʻldi', 'uz').has('boldi')).toBe(false);
  });
});

describe('titleTokens: Persian and Nepali', () => {
  it('unifies Arabic and Persian letters and drops Persian stopwords', () => {
    expect(titleTokens('مجلس بودجه ۱۴۰۵ را تصویب کرد', 'fa')).toEqual(titleTokens('مجلس بودجه 1405 را تصويب كرد', 'fa'));
    expect(titleTokens('مجلس بودجه را تصویب کرد', 'fa')).toEqual(new Set(['مجلس', 'بودجه', 'تصویب']));
    expect(titleTokens('قیمت طلا امروز سه‌شنبه ۱۴ مهر ۱۴۰۵', 'fa')).toEqual(new Set(['طلا', '14']));
  });
  it('keeps Devanagari vowel signs and drops Nepali stopwords', () => {
    expect(titleTokens('संसदमा बजेट पारित भएको छ', 'ne')).toEqual(new Set(['संसदमा', 'बजेट', 'पारित']));
    expect(titleTokens('नेपाल', 'ne')).not.toEqual(titleTokens('नपल', 'ne'));
  });
});

describe('titleTokens: Hebrew', () => {
  it('keeps acronyms whole, strips one prefix letter and drops stopwords', () => {
    expect(titleTokens('ונתניהו נפגש עם ראש שב"כ', 'he')).toEqual(titleTokens('נתניהו נפגש עם ראש שב״כ', 'he'));
    expect(titleTokens("בחו''ל", 'he')).toEqual(titleTokens('בחו"ל', 'he'));
    expect(titleTokens('צה"ל תקף בלבנון היום', 'he')).toEqual(new Set(['צהל', 'תקף', 'לבנון']));
  });
});

describe('titleTokens: Korean, Thai, Bengali and Khmer', () => {
  it('splits Hangul words into syllable pairs so particles still match', () => {
    const a = titleTokens('대통령이 국회를 방문했다', 'ko');
    const b = titleTokens('대통령은 국회 방문', 'ko');
    expect(a.has('대통')).toBe(true);
    expect(a.has('국회')).toBe(true);
    expect(b.has('대통') && b.has('국회') && b.has('방문')).toBe(true);
  });
  it('segments Thai words and drops stopwords', () => {
    expect(titleTokens('นายกรัฐมนตรีเดินทางไปกรุงเทพฯวันนี้', 'th')).toEqual(
      new Set(['นายก', 'รัฐมนตรี', 'เดิน', 'ทาง', 'กรุงเทพฯ']),
    );
  });
  it('keeps Bengali vowel signs and converts digits', () => {
    expect(titleTokens('ঢাকায় ৫ জন আহত হয়েছে', 'bn')).toEqual(new Set(['ঢাকায়', '5', 'জন', 'আহত']));
  });
  it('segments Khmer with or without zero-width spaces, keeping vowel signs', () => {
    const a = titleTokens('កម្ពុជា​កំពុង​ជំរុញ​វិស័យ​អប់រំ ២០២៦', 'km');
    const b = titleTokens('កម្ពុជាកំពុងជំរុញវិស័យអប់រំ', 'km');
    expect(a).toEqual(new Set(['កំពុង', 'ជំរុញ', 'វិស័យ', 'អប់រំ']));
    expect(b).toEqual(a);
  });
});

describe('titleTokens: Somali', () => {
  it('drops particles so the same story matches across outlets', () => {
    const a = titleTokens('Markabka Honour 25 oo la soo gaarsiiyay Boosaaso', 'so');
    const b = titleTokens('Markabka laga soo furtay burcad-badeedda ee HONOUR 25 oo gaarey Boosaaso.', 'so');
    expect(a).toEqual(new Set(['markabka', 'honour', '25', 'gaarsiiyay', 'boosaaso']));
    expect(['markabka', 'honour', 'boosaaso'].every((t) => b.has(t))).toBe(true);
  });
});

describe('titleTokens: years', () => {
  it('drops French calendar words', () => {
    expect(titleTokens('Nécrologie du 06 octobre 2026', 'fr')).toEqual(new Set(['06', 'necrologi']));
  });
  it('drops 20xx years but keeps other numbers', () => {
    expect(titleTokens('Portada del 6 de octubre de 2026', 'es')).toEqual(new Set(['6', 'portada']));
    expect(titleTokens('Liberan a 1906 presos', 'es').has('1906')).toBe(true);
  });
});

describe('titleTokens: Arabic', () => {
  it('strips the article and clitics, and folds spelling variants', () => {
    // "the government" with and, with for, plain; ta marbuta vs ha; hamza on alef.
    expect(titleTokens('والحكومة تقر الموازنة', 'ar')).toEqual(titleTokens('الحكومه تقر موازنة', 'ar'));
    expect(titleTokens('للحكومة', 'ar')).toEqual(new Set(['حكومه']));
    expect(titleTokens('أعلن', 'ar')).toEqual(titleTokens('اعلن', 'ar'));
    expect([...titleTokens('الرئيس المصري يستقبل وزير الخارجية في القاهرة اليوم', 'ar')].sort()).toEqual(
      ['خارجيه', 'رييس', 'مصري', 'قاهره', 'وزير', 'يستقبل'].sort(),
    );
  });
  it('keeps roots that start with و, ب or ل', () => {
    expect(titleTokens('وزير بيان لجنة', 'ar')).toEqual(new Set(['وزير', 'بيان', 'لجنه']));
  });
  it('drops stopwords written in plain spelling', () => {
    expect(titleTokens('هجوم على القافلة إلى الحدود', 'ar')).toEqual(new Set(['هجوم', 'قافله', 'حدود']));
  });
  it('maps Arabic-Indic digits to ASCII', () => {
    expect(titleTokens('مقتل ١٢ شخصا', 'ar').has('12')).toBe(true);
  });
});

describe('titleTokens: Japanese', () => {
  it('cuts kanji runs into bigrams, keeps katakana words and drops hiragana', () => {
    expect([...titleTokens('石破首相がワシントンを訪問', 'ja')].sort()).toEqual(
      ['ワシントン', '破首', '石破', '訪問', '首相'].sort(),
    );
  });

  it('folds full-width digits and Latin, and keeps dakuten distinct', () => {
    const tokens = titleTokens('Ｇ７サミットで１１人', 'ja');
    expect(tokens.has('g7')).toBe(true);
    expect(tokens.has('11')).toBe(true);
    expect(titleTokens('バス事故', 'ja').has('バス')).toBe(true);
    expect(titleTokens('バス事故', 'ja').has('ハス')).toBe(false);
  });

  it('ignores news-site labels', () => {
    expect(titleTokens('【速報】首相が会見', 'ja')).toEqual(new Set(['首相']));
  });
});

describe('HTML and truncation', () => {
  it('strips tags and decodes entities', () => {
    expect(stripHtml('<p>Un <b>vote</b>&nbsp;au S&#xE9;nat &amp; l&#8217;Assemblée</p><img src="x.jpg">')).toBe(
      'Un vote au Sénat & l’Assemblée',
    );
    expect(decodeEntities('Trump&apos;s &quot;plan&quot;')).toBe('Trump\'s "plan"');
    expect(decodeEntities('b&aacute;o ch&iacute; &Eacute;mile &Ouml;zil')).toBe('báo chí Émile Özil');
    expect(decodeEntities('&bdquo;prane&scaron;ė&ldquo;')).toBe('„pranešė“');
    expect(decodeEntities('Kandas, amp;nbsp;MK')).toBe('Kandas,  MK');
  });

  it('truncates at a word boundary with an ellipsis', () => {
    const out = truncate('word '.repeat(100).trim(), 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.endsWith('word…')).toBe(true);
    expect(truncate('short', 300)).toBe('short');
  });

  it('cleans descriptions to ~300 chars and nulls empty ones', () => {
    expect(cleanDescription('<p>  </p>', 300)).toBeNull();
    expect(cleanDescription(undefined, 300)).toBeNull();
    expect(cleanDescription(`<p>${'a b '.repeat(400)}</p>`, 300)!.length).toBeLessThanOrEqual(300);
  });
});
