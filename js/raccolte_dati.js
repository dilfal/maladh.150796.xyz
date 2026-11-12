/* Maladh – le raccolte da ascoltare (sezione «Awrad»). Scritto a mano; i testi e le tracce sono in docs/FONTI.md (§3.1 e §5).
   Per ogni raccolta compare solo l’autore dell’opera, mai chi recita: così vuole AGENTS.md §4.
   p = percorso della registrazione nel pacchetto che l’utente carica da «Su Maladh». */
window.Maladh = window.Maladh || {};
window.Maladh.Raccolte = [
  {
    k: 'rabbana',
    titolo: 'I 40 Rabbana',
    ar: '',
    autore: 'Dal Corano',
    sotto: 'Quaranta invocazioni del Corano',
    img: 'img/raccolte/rabbana.webp',
    tracce: [
      { p: 'rabbana/40_rabbana_completo.mp3', ar: '', t: 'I 40 Rabbana', it: 'Recitazione completa' }
    ]
  },
  {
    k: 'shadhili',
    titolo: 'Ahzab dell’Imam al-Shadhili',
    ar: 'أحزاب الإمام الشاذلي',
    autore: 'Imam Abu al-Hasan al-Shadhili',
    sotto: 'Ventuno litanie',
    img: 'img/raccolte/shadhili.webp',
    tracce: [
      { p: 'shadhili/01_hizb_al_bahr.mp3',     ar: 'حزب البحر',    t: 'Ḥizb al-Baḥr',     it: 'Litania del Mare' },
      { p: 'shadhili/02_hizb_al_barr.mp3',     ar: 'حزب البر',     t: 'Ḥizb al-Barr',     it: 'Litania della Terra' },
      { p: 'shadhili/03_hizb_al_nur.mp3',      ar: 'حزب النور',    t: 'Ḥizb al-Nūr',      it: 'Litania della Luce' },
      { p: 'shadhili/04_hizb_al_nasr.mp3',     ar: 'حزب النصر',    t: 'Ḥizb al-Naṣr',     it: 'Litania della Vittoria e del Soccorso' },
      { p: 'shadhili/05_hizb_al_lutf.mp3',     ar: 'حزب اللطف',    t: 'Ḥizb al-Luṭf',     it: 'Litania della Grazia e della Dolcezza divina' },
      { p: 'shadhili/06_hizb_al_kifayah.mp3',  ar: 'حزب الكفاية',  t: 'Ḥizb al-Kifāya',   it: 'Litania della Sufficienza di Dio' },
      { p: 'shadhili/07_hizb_al_hifdh.mp3',    ar: 'حزب الحفظ',    t: 'Ḥizb al-Ḥifẓ',     it: 'Litania della Custodia e della Protezione' },
      { p: 'shadhili/08_hizb_al_fath.mp3',     ar: 'حزب الفتح',    t: 'Ḥizb al-Fatḥ',     it: 'Litania dell’Apertura interiore' },
      { p: 'shadhili/09_hizb_al_rizq.mp3',     ar: 'حزب الرزق',    t: 'Ḥizb al-Rizq',     it: 'Litania del Sostentamento generoso' },
      { p: 'shadhili/10_hizb_al_ikhfa.mp3',    ar: 'حزب الإخفاء',  t: 'Ḥizb al-Ikhfāʾ',   it: 'Litania del Velo e del Nascondimento' },
      { p: 'shadhili/11_hizb_al_adiyah.mp3',   ar: 'حزب الأدعية',  t: 'Ḥizb al-Adʿiya',   it: 'Raccolta di suppliche dell’Imam' },
      { p: 'shadhili/12_hizb_al_ayat.mp3',     ar: 'حزب الآيات',   t: 'Ḥizb al-Āyāt',     it: 'Litania dei versetti coranici scelti' },
      { p: 'shadhili/13_hizb_al_tawassul.mp3', ar: 'حزب التوسل',   t: 'Ḥizb al-Tawassul', it: 'Litania della vicinanza e dell’intercessione' },
      { p: 'shadhili/14_hizb_al_hujub.mp3',    ar: 'حزب الحجب',    t: 'Ḥizb al-Ḥujub',    it: 'Litania dei Veli di protezione' },
      { p: 'shadhili/15_hizb_al_shakwa.mp3',   ar: 'حزب الشكوى',   t: 'Ḥizb al-Shakwā',   it: 'Litania dell’umiltà e della confidenza nel dolore' },
      { p: 'shadhili/16_hizb_al_hamd.mp3',     ar: 'حزب الحمد',    t: 'Ḥizb al-Ḥamd',     it: 'Litania della Lode continua' },
      { p: 'shadhili/17_hizb_al_sawn.mp3',     ar: 'حزب الصون',    t: 'Ḥizb al-Ṣawn',     it: 'Litania della Preservazione dal male' },
      { p: 'shadhili/18_hizb_al_falah.mp3',    ar: 'حزب الفلاح',   t: 'Ḥizb al-Falāḥ',    it: 'Litania del Vero Successo spirituale' },
      { p: 'shadhili/19_hizb_al_ishraq.mp3',   ar: 'حزب الإشراق',  t: 'Ḥizb al-Ishrāq',   it: 'Litania del Bagliore dell’alba' },
      { p: 'shadhili/20_hizb_al_najah.mp3',    ar: 'حزب النجاة',   t: 'Ḥizb al-Najāh',    it: 'Litania della Salvezza e della Liberazione' },
      { p: 'shadhili/21_hizb_al_khalwah.mp3',  ar: 'حزب الخلوة',   t: 'Ḥizb al-Khalwa',   it: 'Litania del Ritiro e della Solitudine sacra' }
    ]
  },
  {
    k: 'jilani',
    titolo: 'Hizb dell’Imam al-Jilani',
    ar: 'حزب النصر',
    autore: 'Imam Abd al-Qadir al-Jilani',
    sotto: 'Litania del Soccorso',
    img: 'img/raccolte/jilani.webp',
    tracce: [
      { p: 'special/jilani_hizb_nasr.mp3', ar: 'حزب النصر', t: 'Ḥizb al-Naṣr', it: 'Litania del Soccorso' }
    ]
  },
  {
    k: 'rifai',
    titolo: 'Awrad dell’Imam al-Rifa’i',
    ar: 'أوراد الإمام الرفاعي',
    autore: 'Imam Ahmad al-Rifa’i',
    sotto: 'Quattro litanie',
    img: 'img/raccolte/rifai.webp',
    tracce: [
      { p: 'special/rifaai_wird_futuh.mp3', ar: 'ورد الفتوح',      t: 'Wird al-Futūḥ',      it: 'Apertura spirituale' },
      { p: 'special/rifaai_wird_sayf.mp3',  ar: 'ورد السيف القاطع', t: 'Wird al-Sayf al-Qāṭiʿ', it: 'Protezione decisa' },
      { p: 'special/rifaai_hizb_satr.mp3',  ar: 'حزب الستر',       t: 'Ḥizb al-Satr',       it: 'Velo e custodia' },
      { p: 'special/rifaai_hizb_faraj.mp3', ar: 'حزب الفرج',       t: 'Ḥizb al-Faraj',      it: 'Sollievo dalle angosce' }
    ]
  },
  {
    k: 'jawshan',
    titolo: 'Jawshan',
    ar: '',
    autore: 'Tradizione devozionale',
    sotto: 'La grande e la piccola corazza',
    img: 'img/raccolte/jawshan.webp',
    tracce: [
      { p: 'special/jawshan_kabir.mp3',  ar: 'الجوشن الكبير', t: 'Al-Jawshan al-Kabīr', it: 'La grande corazza' },
      { p: 'special/jawshan_saghir.mp3', ar: 'الجوشن الصغير', t: 'Al-Jawshan al-Ṣaghīr', it: 'La piccola corazza' }
    ]
  }
];
