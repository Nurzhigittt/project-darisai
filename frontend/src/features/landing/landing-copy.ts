export interface LandingCopy {
  nav: {
    how: string;
    students: string;
    teachers: string;
    questions: string;
    login: string;
    menu: string;
    close: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    accent: string;
    body: string;
    teacherCta: string;
    studentCta: string;
    note: string;
  };
  join: { label: string; placeholder: string; button: string; hint: string };
  demo: {
    label: string;
    course: string;
    topic: string;
    student: string;
    teacher: string;
    timer: string;
    signal: string;
    signalSent: string;
    before: string;
    after: string;
    caption: string;
    reset: string;
  };
  statement: { eyebrow: string; title: string; body: string };
  roles: {
    studentLabel: string;
    studentTitle: string;
    studentBody: string;
    studentPoints: string[];
    teacherLabel: string;
    teacherTitle: string;
    teacherBody: string;
    teacherPoints: string[];
  };
  process: {
    eyebrow: string;
    title: string;
    steps: { title: string; body: string }[];
  };
  faq: { title: string; items: { question: string; answer: string }[] };
  closing: { title: string; body: string; teacherCta: string; studentCta: string };
  footer: { tagline: string; privacy: string; status: string; copyright: string };
}

export const landingCopy: Record<"en" | "ru" | "kk", LandingCopy> = {
  en: {
    nav: {
      how: "How it works",
      students: "For students",
      teachers: "For lecturers",
      questions: "Questions",
      login: "Log in",
      menu: "Open menu",
      close: "Close menu",
    },
    hero: {
      eyebrow: "Feedback during the lecture",
      title: "Understanding starts",
      accent: "with a single signal.",
      body: "A student taps when something is unclear. The lecturer sees the audience’s combined signal and can pause to explain.",
      teacherCta: "I’m a lecturer",
      studentCta: "Join a lecture",
      note: "In your browser. No student account needed.",
    },
    join: {
      label: "Already in a lecture?",
      placeholder: "Lecture code",
      button: "Join",
      hint: "Enter the six-character code from your lecturer.",
    },
    demo: {
      label: "An example of the interaction",
      course: "Introduction to statistics",
      topic: "Correlation and causation",
      student: "Student’s screen",
      teacher: "Lecturer’s screen",
      timer: "During the lecture",
      signal: "I’m not following",
      signalSent: "Example shown",
      before: "Few signals",
      after: "Clarification may help",
      caption: "Try the button. The chart illustrates the audience’s combined signal, not a live lecture.",
      reset: "Try again",
    },
    statement: {
      eyebrow: "A little room for a question",
      title: "Silence doesn’t always mean understanding.",
      body: "Speaking up in a full lecture hall can be difficult. A simple signal gives students another way to say they need an explanation.",
    },
    roles: {
      studentLabel: "For students",
      studentTitle: "Say it’s unclear. Keep listening.",
      studentBody: "You don’t have to find the right words or interrupt the lecture. Tap the button when you need a little more explanation.",
      studentPoints: [
        "Join with a code or QR",
        "No account, name or email required",
        "One clear action during the lecture",
      ],
      teacherLabel: "For lecturers",
      teacherTitle: "Notice when it’s worth pausing.",
      teacherBody: "Follow the audience’s combined signal while you teach. You decide when to slow down, offer an example or explain the idea again.",
      teacherPoints: [
        "Share a lecture code or QR",
        "See feedback from the audience as a whole",
        "Review signal activity after the lecture",
      ],
    },
    process: {
      eyebrow: "From a signal to an explanation",
      title: "Three steps. One shared lecture.",
      steps: [
        {
          title: "Open the lecture",
          body: "The lecturer starts a session and shares its code or QR. Students join in their browser.",
        },
        {
          title: "Send a signal",
          body: "When something is unclear, a student taps the button. No message to compose, no account to create.",
        },
        {
          title: "Make room to explain",
          body: "The lecturer sees the combined audience signal and chooses how to respond.",
        },
      ],
    },
    faq: {
      title: "Before the first lecture",
      items: [
        {
          question: "Do students need to register?",
          answer: "No. Enter the lecture code or scan the QR shared by your lecturer. DärisAI works in your browser; no installation is required.",
        },
        {
          question: "Can the lecturer see who pressed the button?",
          answer: "The lecturer’s screen shows combined audience activity, not an individual student’s signals. Joining does not require your name or email. See the privacy page for details about data handling.",
        },
        {
          question: "Does a quiet screen mean everyone understands?",
          answer: "No. Few signals only mean that few signals have been sent. Students may stay quiet for many reasons, so DärisAI does not turn silence into a measure of understanding.",
        },
        {
          question: "How does a lecturer get started?",
          answer: "Sign in with your lecturer invite code, create a course and a lecture, then share the lecture code with your students.",
        },
      ],
    },
    closing: {
      title: "Leave room for understanding.",
      body: "Make it easier for your students to say when they need an explanation.",
      teacherCta: "Open lecturer workspace",
      studentCta: "Join with a code",
    },
    footer: {
      tagline: "A signal worth listening to.",
      privacy: "Privacy",
      status: "Service status",
      copyright: "Қазақша · Русский · English",
    },
  },
  ru: {
    nav: {
      how: "Как это работает",
      students: "Студентам",
      teachers: "Преподавателям",
      questions: "Вопросы",
      login: "Войти",
      menu: "Открыть меню",
      close: "Закрыть меню",
    },
    hero: {
      eyebrow: "Обратная связь во время лекции",
      title: "Понимание начинается",
      accent: "с одного сигнала.",
      body: "Студент нажимает кнопку, когда что-то непонятно. Преподаватель видит общий сигнал аудитории и может остановиться, чтобы пояснить.",
      teacherCta: "Я преподаватель",
      studentCta: "Присоединиться к лекции",
      note: "Работает в браузере. Студентам не нужен аккаунт.",
    },
    join: {
      label: "Вы уже на лекции?",
      placeholder: "Код лекции",
      button: "Присоединиться",
      hint: "Введите код из шести символов, который дал преподаватель.",
    },
    demo: {
      label: "Пример взаимодействия",
      course: "Введение в статистику",
      topic: "Корреляция и причинность",
      student: "Экран студента",
      teacher: "Экран преподавателя",
      timer: "Во время лекции",
      signal: "Мне непонятно",
      signalSent: "Пример показан",
      before: "Мало сигналов",
      after: "Возможно, стоит пояснить",
      caption: "Попробуйте кнопку. На графике — пример общего сигнала аудитории, а не данные настоящей лекции.",
      reset: "Попробовать ещё раз",
    },
    statement: {
      eyebrow: "Место для вопроса",
      title: "Тишина не всегда означает понимание.",
      body: "В большой аудитории бывает трудно поднять руку. Простой сигнал даёт студенту ещё один способ сказать, что ему нужно пояснение.",
    },
    roles: {
      studentLabel: "Студентам",
      studentTitle: "Скажите, что непонятно. Продолжайте слушать.",
      studentBody: "Не нужно подбирать слова или прерывать лекцию. Нажмите кнопку, когда хочется чуть больше объяснений.",
      studentPoints: [
        "Вход по коду или QR",
        "Без аккаунта, имени и email",
        "Одно понятное действие во время лекции",
      ],
      teacherLabel: "Преподавателям",
      teacherTitle: "Замечайте, когда стоит остановиться.",
      teacherBody: "Следите за общим сигналом аудитории по ходу лекции. Вы решаете, когда замедлиться, привести пример или объяснить мысль ещё раз.",
      teacherPoints: [
        "Поделитесь кодом или QR лекции",
        "Получайте общую обратную связь от аудитории",
        "Посмотрите сводку сигналов после занятия",
      ],
    },
    process: {
      eyebrow: "От сигнала к пояснению",
      title: "Три шага. Одна общая лекция.",
      steps: [
        {
          title: "Откройте лекцию",
          body: "Преподаватель начинает занятие и показывает код или QR. Студенты подключаются в браузере.",
        },
        {
          title: "Подайте сигнал",
          body: "Если что-то непонятно, студент нажимает кнопку. Не нужно писать сообщение или создавать аккаунт.",
        },
        {
          title: "Дайте место объяснению",
          body: "Преподаватель видит общий сигнал аудитории и выбирает, как на него отреагировать.",
        },
      ],
    },
    faq: {
      title: "Перед первой лекцией",
      items: [
        {
          question: "Студентам нужно регистрироваться?",
          answer: "Нет. Достаточно ввести код лекции или отсканировать QR от преподавателя. DärisAI работает в браузере, устанавливать приложение не нужно.",
        },
        {
          question: "Преподаватель увидит, кто нажал кнопку?",
          answer: "На экране преподавателя отображается общая активность аудитории, а не сигналы отдельных студентов. Для входа не нужны имя или email. Подробнее об обработке данных — в разделе «Конфиденциальность».",
        },
        {
          question: "Если сигналов мало, значит, всем всё понятно?",
          answer: "Нет. Мало сигналов означает только то, что их мало отправили. У молчания могут быть разные причины, поэтому DärisAI не считает его показателем понимания.",
        },
        {
          question: "Как преподавателю начать работу?",
          answer: "Войдите по коду приглашения преподавателя, создайте курс и лекцию, затем поделитесь кодом лекции со студентами.",
        },
      ],
    },
    closing: {
      title: "Оставьте место для понимания.",
      body: "Дайте студентам простой способ сообщить, что им нужно пояснение.",
      teacherCta: "Открыть кабинет преподавателя",
      studentCta: "Войти по коду",
    },
    footer: {
      tagline: "Сигнал, к которому стоит прислушаться.",
      privacy: "Конфиденциальность",
      status: "Состояние сервиса",
      copyright: "Қазақша · Русский · English",
    },
  },
  kk: {
    nav: {
      how: "Қалай жұмыс істейді",
      students: "Студенттерге",
      teachers: "Оқытушыларға",
      questions: "Сұрақтар",
      login: "Кіру",
      menu: "Мәзірді ашу",
      close: "Мәзірді жабу",
    },
    hero: {
      eyebrow: "Дәріс кезіндегі кері байланыс",
      title: "Түсіну",
      accent: "бір белгіден басталады.",
      body: "Студент бір нәрсені түсінбесе, батырманы басады. Оқытушы аудиторияның ортақ белгісін көріп, кідіріп түсіндіре алады.",
      teacherCta: "Мен оқытушымын",
      studentCta: "Дәріске қосылу",
      note: "Браузерде жұмыс істейді. Студентке аккаунт қажет емес.",
    },
    join: {
      label: "Дәріске келдіңіз бе?",
      placeholder: "Дәріс коды",
      button: "Қосылу",
      hint: "Оқытушы берген алты таңбалы кодты енгізіңіз.",
    },
    demo: {
      label: "Өзара әрекеттесу мысалы",
      course: "Статистикаға кіріспе",
      topic: "Корреляция және себеп-салдар байланысы",
      student: "Студент экраны",
      teacher: "Оқытушы экраны",
      timer: "Дәріс кезінде",
      signal: "Маған түсініксіз",
      signalSent: "Мысал көрсетілді",
      before: "Белгілер аз",
      after: "Түсіндіру қажет болуы мүмкін",
      caption: "Батырманы басып көріңіз. Графикте нақты дәрістің деректері емес, аудиторияның ортақ белгісінің мысалы көрсетілген.",
      reset: "Қайта көру",
    },
    statement: {
      eyebrow: "Сұраққа орын бар",
      title: "Үнсіздік әрдайым түсінгенді білдірмейді.",
      body: "Үлкен аудиторияда қол көтеру оңай бола бермейді. Қарапайым белгі студентке қосымша түсіндіру қажет екенін білдірудің тағы бір жолын ұсынады.",
    },
    roles: {
      studentLabel: "Студенттерге",
      studentTitle: "Түсініксіз екенін білдіріңіз. Тыңдай беріңіз.",
      studentBody: "Сөз іздеудің немесе дәрісті бөлудің қажеті жоқ. Қосымша түсіндіру керек болса, батырманы басыңыз.",
      studentPoints: [
        "Код немесе QR арқылы қосылу",
        "Аккаунт, аты-жөн немесе email қажет емес",
        "Дәріс кезіндегі бір қарапайым әрекет",
      ],
      teacherLabel: "Оқытушыларға",
      teacherTitle: "Қашан кідіру керегін байқаңыз.",
      teacherBody: "Дәріс барысында аудиторияның ортақ белгісін бақылаңыз. Қашан баяулау, мысал келтіру немесе ойды қайта түсіндіру керегін өзіңіз шешесіз.",
      teacherPoints: [
        "Дәріс кодын немесе QR көрсетіңіз",
        "Аудиторияның жалпы кері байланысын көріңіз",
        "Сабақтан кейін белгілердің қорытындысын қараңыз",
      ],
    },
    process: {
      eyebrow: "Белгіден түсіндіруге дейін",
      title: "Үш қадам. Бір ортақ дәріс.",
      steps: [
        {
          title: "Дәрісті ашыңыз",
          body: "Оқытушы сабақты бастап, кодты немесе QR көрсетеді. Студенттер браузер арқылы қосылады.",
        },
        {
          title: "Белгі беріңіз",
          body: "Бір нәрсе түсініксіз болса, студент батырманы басады. Хабарлама жазудың немесе аккаунт ашудың қажеті жоқ.",
        },
        {
          title: "Түсіндіруге уақыт бөліңіз",
          body: "Оқытушы аудиторияның ортақ белгісін көріп, қалай жауап беру керегін өзі таңдайды.",
        },
      ],
    },
    faq: {
      title: "Алғашқы дәріс алдында",
      items: [
        {
          question: "Студенттерге тіркелу керек пе?",
          answer: "Жоқ. Дәріс кодын енгізу немесе оқытушы көрсеткен QR кодын сканерлеу жеткілікті. DärisAI браузерде жұмыс істейді, қолданба орнатудың қажеті жоқ.",
        },
        {
          question: "Оқытушы батырманы кім басқанын көре ме?",
          answer: "Оқытушы экранында жеке студенттердің белгілері емес, аудиторияның жалпы белсенділігі көрсетіледі. Қосылу үшін аты-жөн немесе email қажет емес. Деректерді өңдеу туралы толығырақ «Құпиялық» бөлімінен оқыңыз.",
        },
        {
          question: "Белгілер аз болса, бәрі түсінді деген сөз бе?",
          answer: "Жоқ. Белгілердің аз болуы олардың аз жіберілгенін ғана білдіреді. Үнсіздіктің түрлі себебі болуы мүмкін, сондықтан DärisAI оны түсінудің көрсеткіші деп есептемейді.",
        },
        {
          question: "Оқытушы жұмысты қалай бастайды?",
          answer: "Оқытушының шақыру кодымен кіріп, курс пен дәріс құрыңыз. Содан кейін дәріс кодын студенттерге беріңіз.",
        },
      ],
    },
    closing: {
      title: "Түсінуге мүмкіндік беріңіз.",
      body: "Студенттерге қосымша түсіндіру қажет екенін білдірудің қарапайым жолын ұсыныңыз.",
      teacherCta: "Оқытушы кабинетіне кіру",
      studentCta: "Кодпен қосылу",
    },
    footer: {
      tagline: "Назар аударуға тұрарлық белгі.",
      privacy: "Құпиялық",
      status: "Сервис күйі",
      copyright: "Қазақша · Русский · English",
    },
  },
};
