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
    chips: string[];
  };
  join: {
    title: string;
    label: string;
    placeholder: string;
    button: string;
    hint: string;
    helper: string;
    teacherPrompt: string;
  };
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
      login: "Lecturer login",
      menu: "Open menu",
      close: "Close menu"
    },
    hero: {
      eyebrow: "For the moments you lose the thread",
      title: "Something unclear?",
      accent: "That’s okay.",
      body: "Join your lecture and tap “I’m not following” when you need an explanation. Your lecturer sees the audience’s combined signal.",
      teacherCta: "Lecturer login",
      studentCta: "Enter a code",
      note: "Your lecturer will share the code.",
      chips: [
        "No account",
        "In your browser",
        "One tap"
      ]
    },
    join: {
      title: "In a lecture?",
      label: "Code from your lecturer",
      placeholder: "6 characters",
      button: "Join the lecture",
      hint: "6 characters: letters and numbers.",
      helper: "No code yet? Ask your lecturer.",
      teacherPrompt: "Teaching a class?"
    },
    demo: {
      label: "Try it here",
      course: "Introduction to statistics",
      topic: "Correlation and causation",
      student: "Your screen",
      teacher: "Lecturer’s screen",
      timer: "During the lecture",
      signal: "I’m not following",
      signalSent: "That was an example",
      before: "Few signals",
      after: "Clarification may help",
      caption: "You can try the button. This is an example, not a live lecture. The chart shows a combined audience signal, not the result of a single tap.",
      reset: "Try again"
    },
    statement: {
      eyebrow: "When raising your hand feels difficult",
      title: "Asking can be harder than it looks.",
      body: "A new topic, a quick explanation, an unfamiliar example. It happens. One tap lets you say you need a little more explanation."
    },
    roles: {
      studentLabel: "For students",
      studentTitle: "Lost the thread? Say so.",
      studentBody: "You don’t need a perfectly worded question. Tap “I’m not following” and keep listening.",
      studentPoints: [
        "Join with a code or QR",
        "No name, email or account needed",
        "Send a signal without interrupting"
      ],
      teacherLabel: "For lecturers",
      teacherTitle: "Know when to explain a little more.",
      teacherBody: "The audience’s combined signal helps you notice when clarification may be useful. You decide whether to pause, give an example or go over an idea again.",
      teacherPoints: [
        "Share a lecture code or QR",
        "See feedback from the audience as a whole",
        "Review signal activity after class"
      ]
    },
    process: {
      eyebrow: "Getting started",
      title: "Get the code. Join. Tap when you need to.",
      steps: [
        {
          title: "Enter the code",
          body: "Get the six-character code from your lecturer, or scan the QR on their screen."
        },
        {
          title: "Tap if you get stuck",
          body: "Your lecture has a button: “I’m not following”. Use it when you need an explanation."
        },
        {
          title: "Your lecturer sees the bigger picture",
          body: "The lecturer sees the audience’s combined signal and chooses when to explain more."
        }
      ]
    },
    faq: {
      title: "Good to know",
      items: [
        {
          question: "Do I need an account?",
          answer: "No. Enter the lecture code or scan your lecturer’s QR. It works in your browser, so there’s nothing to install."
        },
        {
          question: "Can the lecturer see that I pressed the button?",
          answer: "Their screen shows combined audience activity, not your individual signals. You don’t need to enter your name or email. The privacy page explains how data is handled."
        },
        {
          question: "Do fewer signals mean everyone understands?",
          answer: "No. People can stay quiet for lots of reasons. DärisAI shows signal activity; it doesn’t treat silence as proof of understanding."
        },
        {
          question: "How can a lecturer start using it?",
          answer: "Sign in with a lecturer invite code, create a course and a lecture, then share the lecture code with students."
        }
      ]
    },
    closing: {
      title: "Got your lecture code?",
      body: "Enter it and join your class.",
      teacherCta: "Lecturer login",
      studentCta: "Enter a code"
    },
    footer: {
      tagline: "A simple way to say “I’m not following”.",
      privacy: "Privacy",
      status: "Service status",
      copyright: "Қазақша · Русский · English"
    }
  },
  ru: {
    nav: {
      how: "Как это работает",
      students: "Студентам",
      teachers: "Преподавателям",
      questions: "Вопросы",
      login: "Вход для преподавателя",
      menu: "Открыть меню",
      close: "Закрыть меню"
    },
    hero: {
      eyebrow: "Когда потерял нить на лекции",
      title: "Не всё понятно?",
      accent: "Это нормально.",
      body: "Подключись к лекции и нажми «Мне непонятно», когда нужно пояснение. Преподаватель увидит общий сигнал аудитории.",
      teacherCta: "Вход для преподавателя",
      studentCta: "Ввести код",
      note: "Код лекции подскажет преподаватель.",
      chips: [
        "Без аккаунта",
        "В браузере",
        "Одно касание"
      ]
    },
    join: {
      title: "Ты на лекции?",
      label: "Код от преподавателя",
      placeholder: "6 символов",
      button: "Присоединиться",
      hint: "6 символов: буквы и цифры.",
      helper: "Нет кода? Попроси его у преподавателя.",
      teacherPrompt: "Ведёте занятие?"
    },
    demo: {
      label: "Попробуй прямо здесь",
      course: "Введение в статистику",
      topic: "Корреляция и причинность",
      student: "Твой экран",
      teacher: "Экран преподавателя",
      timer: "Во время лекции",
      signal: "Мне непонятно",
      signalSent: "Это был пример",
      before: "Мало сигналов",
      after: "Возможно, стоит пояснить",
      caption: "Кнопку можно нажать. Это пример, а не настоящая лекция. График показывает общий сигнал аудитории, а не результат одного нажатия.",
      reset: "Попробовать ещё раз"
    },
    statement: {
      eyebrow: "Когда не хочется поднимать руку",
      title: "Спросить бывает сложнее, чем кажется.",
      body: "Новая тема, быстрый темп, сложный пример — потерять нить может каждый. Одно касание поможет сказать, что тебе нужно пояснение."
    },
    roles: {
      studentLabel: "Студентам",
      studentTitle: "Потерял нить? Дай знать.",
      studentBody: "Необязательно сразу формулировать вопрос. Нажми «Мне непонятно» и продолжай слушать.",
      studentPoints: [
        "Подключись по коду или QR",
        "Без имени, email и аккаунта",
        "Подай сигнал, не прерывая лекцию"
      ],
      teacherLabel: "Преподавателям",
      teacherTitle: "Замечайте, когда нужно пояснение.",
      teacherBody: "Общий сигнал аудитории помогает заметить, когда стоит остановиться. Привести пример или разобрать мысль ещё раз — решаете вы.",
      teacherPoints: [
        "Поделитесь кодом или QR лекции",
        "Получайте общую обратную связь от аудитории",
        "Посмотрите сводку сигналов после занятия"
      ]
    },
    process: {
      eyebrow: "С чего начать",
      title: "Код. Лекция. Одна кнопка.",
      steps: [
        {
          title: "Введи код",
          body: "Попроси у преподавателя код из шести символов или отсканируй QR на экране."
        },
        {
          title: "Нажми, если запутался",
          body: "На экране лекции есть кнопка «Мне непонятно». Нажми её, когда нужно пояснение."
        },
        {
          title: "Преподаватель увидит общую картину",
          body: "Сигналы студентов складываются в общий сигнал аудитории. Преподаватель решает, когда пояснить подробнее."
        }
      ]
    },
    faq: {
      title: "Что ещё нужно знать",
      items: [
        {
          question: "Мне нужен аккаунт?",
          answer: "Нет. Введи код лекции или отсканируй QR от преподавателя. Всё работает в браузере, устанавливать приложение не нужно."
        },
        {
          question: "Преподаватель увидит, что кнопку нажал я?",
          answer: "На его экране видна общая активность аудитории, а не твои отдельные сигналы. Вводить имя или email не нужно. Подробнее об обработке данных — в разделе «Конфиденциальность»."
        },
        {
          question: "Мало сигналов — значит, всем всё понятно?",
          answer: "Нет. Молчать можно по разным причинам. DärisAI показывает активность сигналов и не считает тишину доказательством понимания."
        },
        {
          question: "Как начать работу преподавателю?",
          answer: "Войдите по коду приглашения преподавателя, создайте курс и лекцию, затем поделитесь кодом лекции со студентами."
        }
      ]
    },
    closing: {
      title: "Код лекции уже есть?",
      body: "Введи его и присоединяйся к занятию.",
      teacherCta: "Вход для преподавателя",
      studentCta: "Ввести код"
    },
    footer: {
      tagline: "Простой способ сказать «Мне непонятно».",
      privacy: "Конфиденциальность",
      status: "Состояние сервиса",
      copyright: "Қазақша · Русский · English"
    }
  },
  kk: {
    nav: {
      how: "Қалай жұмыс істейді",
      students: "Студенттерге",
      teachers: "Оқытушыларға",
      questions: "Сұрақтар",
      login: "Оқытушы кабинеті",
      menu: "Мәзірді ашу",
      close: "Мәзірді жабу"
    },
    hero: {
      eyebrow: "Дәрісте бір нәрсені түсінбей қалсаң",
      title: "Түсінбей қалдың ба?",
      accent: "Ондай болады.",
      body: "Дәріске қосыл да, түсіндіру қажет болса, «Маған түсініксіз» батырмасын бас. Оқытушы аудиторияның ортақ белгісін көреді.",
      teacherCta: "Оқытушы кабинеті",
      studentCta: "Кодты енгізу",
      note: "Дәріс кодын оқытушы береді.",
      chips: [
        "Аккаунтсыз",
        "Браузерде",
        "Бір рет басу"
      ]
    },
    join: {
      title: "Дәрістесің бе?",
      label: "Оқытушы берген код",
      placeholder: "6 таңба",
      button: "Қосылу",
      hint: "6 таңба: әріптер мен сандар.",
      helper: "Код жоқ па? Оқытушыдан сұра.",
      teacherPrompt: "Сабақ жүргізесіз бе?"
    },
    demo: {
      label: "Осында байқап көр",
      course: "Статистикаға кіріспе",
      topic: "Корреляция және себеп-салдар байланысы",
      student: "Сенің экраның",
      teacher: "Оқытушы экраны",
      timer: "Дәріс кезінде",
      signal: "Маған түсініксіз",
      signalSent: "Бұл мысал еді",
      before: "Белгілер аз",
      after: "Түсіндіру қажет болуы мүмкін",
      caption: "Батырманы басып көруге болады. Бұл — мысал, нақты дәріс емес. График бір рет басудың нәтижесін емес, аудиторияның ортақ белгісін көрсетеді.",
      reset: "Қайта көру"
    },
    statement: {
      eyebrow: "Қол көтергің келмегенде",
      title: "Сұрақ қою әрдайым оңай емес.",
      body: "Жаңа тақырып, жылдам түсіндіру, күрделі мысал — кез келген адам түсінбей қалуы мүмкін. Бір рет басып, қосымша түсіндіру қажет екенін білдіре аласың."
    },
    roles: {
      studentLabel: "Студенттерге",
      studentTitle: "Түсінбей қалдың ба? Белгі бер.",
      studentBody: "Сұрақты бірден құрастыру міндетті емес. «Маған түсініксіз» батырмасын бас та, тыңдай бер.",
      studentPoints: [
        "Код немесе QR арқылы қосыл",
        "Аты-жөн, email және аккаунт қажет емес",
        "Дәрісті бөлмей белгі бер"
      ],
      teacherLabel: "Оқытушыларға",
      teacherTitle: "Түсіндіру қажет сәтті байқаңыз.",
      teacherBody: "Аудиторияның ортақ белгісі қашан кідіру керегін байқауға көмектеседі. Мысал келтіруді немесе ойды қайта түсіндіруді өзіңіз шешесіз.",
      teacherPoints: [
        "Дәріс кодын немесе QR көрсетіңіз",
        "Аудиторияның жалпы кері байланысын көріңіз",
        "Сабақтан кейін белгілердің қорытындысын қараңыз"
      ]
    },
    process: {
      eyebrow: "Неден бастау керек",
      title: "Код. Дәріс. Бір батырма.",
      steps: [
        {
          title: "Кодты енгіз",
          body: "Оқытушыдан алты таңбалы кодты сұра немесе экрандағы QR кодын сканерле."
        },
        {
          title: "Түсінбесең, батырманы бас",
          body: "Дәріс экранында «Маған түсініксіз» батырмасы бар. Түсіндіру қажет болғанда, соны бас."
        },
        {
          title: "Оқытушы жалпы жағдайды көреді",
          body: "Студенттердің белгілері аудиторияның ортақ белгісін құрайды. Қашан толығырақ түсіндіруді оқытушы шешеді."
        }
      ]
    },
    faq: {
      title: "Сенде осындай сұрақтар болуы мүмкін",
      items: [
        {
          question: "Маған аккаунт керек пе?",
          answer: "Жоқ. Дәріс кодын енгіз немесе оқытушы көрсеткен QR кодын сканерле. Бәрі браузерде жұмыс істейді, қолданба орнатудың қажеті жоқ."
        },
        {
          question: "Оқытушы батырманы мен басқанымды көре ме?",
          answer: "Оның экранында сенің жеке белгілерің емес, аудиторияның жалпы белсенділігі көрінеді. Аты-жөніңді немесе email енгізудің қажеті жоқ. Деректерді өңдеу туралы «Құпиялық» бөлімінен оқи аласың."
        },
        {
          question: "Белгілер аз болса, бәрі түсінді деген сөз бе?",
          answer: "Жоқ. Үнсіздіктің түрлі себебі болуы мүмкін. DärisAI жіберілген белгілерді көрсетеді, бірақ үнсіздікті түсінгеннің дәлелі деп санамайды."
        },
        {
          question: "Оқытушы жұмысты қалай бастайды?",
          answer: "Оқытушының шақыру кодымен кіріп, курс пен дәріс құрыңыз. Содан кейін дәріс кодын студенттерге беріңіз."
        }
      ]
    },
    closing: {
      title: "Дәріс коды бар ма?",
      body: "Оны енгіз де, сабаққа қосыл.",
      teacherCta: "Оқытушы кабинеті",
      studentCta: "Кодты енгізу"
    },
    footer: {
      tagline: "«Маған түсініксіз» деудің қарапайым жолы.",
      privacy: "Құпиялық",
      status: "Сервис күйі",
      copyright: "Қазақша · Русский · English"
    }
  }
};
