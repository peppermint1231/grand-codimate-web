// Patient-facing categories adapted from the clinic recommender.
// Clinical suitability is decided during the consultation, not by this navigator.
export const concerns = [
  {
    id: "pigment",
    name: "점·잡티·기미",
    questions: [
      {
        id: "moles",
        label: "점이 여러 개 있거나 크기별 제거가 필요해요",
      },
      {
        id: "spots",
        label: "잡티·주근깨가 눈에 띄어요",
      },
      {
        id: "melasma",
        label: "기미가 넓게 퍼져 있어요",
      },
      {
        id: "complex-pigment",
        label: "기미, 잡티, 칙칙한 피부톤이 같이 고민이에요",
      },
    ],
  },
  {
    id: "acne",
    name: "여드름",
    questions: [
      {
        id: "inflammatory-acne",
        label: "염증성 여드름이 자주 올라와요",
      },
      {
        id: "sebum",
        label: "피지가 많고 모공이 쉽게 막혀요",
      },
      {
        id: "acne-pores",
        label: "여드름과 모공이 같이 고민이에요",
      },
      {
        id: "body-acne",
        label: "등드름·가드름이 있어요",
      },
    ],
  },
  {
    id: "scar",
    name: "여드름 자국·흉터",
    questions: [
      {
        id: "red-mark",
        label: "붉은 여드름 자국이 남았어요",
      },
      {
        id: "brown-mark",
        label: "갈색·검은 자국이 남았어요",
      },
      {
        id: "pitted-scar",
        label: "패인 흉터와 울퉁불퉁한 피부결이 고민이에요",
      },
      {
        id: "deep-scar",
        label: "흉터가 깊고 오래됐어요",
      },
    ],
  },
  {
    id: "pores",
    name: "모공·피부결",
    questions: [
      {
        id: "large-pores",
        label: "모공이 넓어 보여요",
      },
      {
        id: "rough-texture",
        label: "피부결이 거칠고 화장이 잘 안 먹어요",
      },
      {
        id: "blackhead",
        label: "블랙헤드와 코 피지가 많아요",
      },
    ],
  },
  {
    id: "redness",
    name: "홍조·딸기코",
    questions: [
      {
        id: "face-redness",
        label: "얼굴 전체가 쉽게 붉어져요",
      },
      {
        id: "rosacea-nose",
        label: "코 주변이 붉고 딸기코처럼 보여요",
      },
      {
        id: "sensitive-barrier",
        label: "홍조와 장벽 약화가 같이 있어요",
      },
    ],
  },
  {
    id: "lifting",
    name: "주름·탄력·리프팅",
    questions: [
      {
        id: "jawline",
        label: "턱라인과 얼굴 처짐이 고민이에요",
      },
      {
        id: "double-chin",
        label: "이중턱이 고민이에요",
      },
      {
        id: "thread-lift",
        label: "실리프팅 프로그램을 상담하고 싶어요",
      },
      {
        id: "wrinkles",
        label: "이마·미간·팔자·목주름이 고민이에요",
      },
    ],
  },
  {
    id: "eye",
    name: "눈밑 꺼짐·다크서클",
    questions: [
      {
        id: "under-eye-hollow",
        label: "눈밑이 꺼져 보여요",
      },
      {
        id: "dark-circle",
        label: "다크서클이 고민이에요",
      },
    ],
  },
  {
    id: "booster",
    name: "스킨부스터·피부재생",
    questions: [
      {
        id: "glow",
        label: "수분감과 광채를 원해요",
      },
      {
        id: "regeneration",
        label: "재생과 탄력을 같이 원해요",
      },
      {
        id: "texture-booster",
        label: "모공·피부결까지 같이 개선하고 싶어요",
      },
    ],
  },
  {
    id: "botox-filler",
    name: "보톡스·필러",
    questions: [
      {
        id: "botox-wrinkle",
        label: "표정주름을 줄이고 싶어요",
      },
      {
        id: "face-line",
        label: "얼굴 라인을 정리하고 싶어요",
      },
      {
        id: "filler-volume",
        label: "꺼진 부위에 볼륨을 넣고 싶어요",
      },
    ],
  },
  {
    id: "hair-removal",
    name: "제모",
    questions: [
      {
        id: "face-hair",
        label: "얼굴 작은 부위를 제모하고 싶어요",
      },
      {
        id: "male-beard",
        label: "남성 수염 부위를 제모하고 싶어요",
      },
    ],
  },
  {
    id: "body",
    name: "비만·이중턱",
    questions: [
      {
        id: "double-chin-body",
        label: "얼굴 이중턱이 고민이에요",
      },
      {
        id: "body-line",
        label: "복부·팔·허벅지 등 바디라인이 고민이에요",
      },
      {
        id: "fat-injection",
        label: "국소 지방을 주사로 관리하고 싶어요",
      },
    ],
  },
  {
    id: "hair-loss",
    name: "탈모",
    questions: [
      {
        id: "early-hair-loss",
        label: "전체적으로 숱이 줄어드는 느낌이에요",
      },
      {
        id: "intensive-scalp",
        label: "이마·정수리 또는 전체 밀도가 고민이에요",
      },
      {
        id: "spot-hair-loss",
        label: "동그랗게 빠진 부위가 있어요",
      },
    ],
  },
  {
    id: "tattoo",
    name: "문신제거",
    questions: [
      {
        id: "black-tattoo",
        label: "단색 문신을 제거하고 싶어요",
      },
      {
        id: "color-tattoo",
        label: "컬러 문신을 제거하고 싶어요",
      },
    ],
  },
  {
    id: "medical",
    name: "피부·손발톱 진료",
    questions: [
      {
        id: "skin-visit",
        label: "피부 증상으로 진료를 받고 싶어요",
      },
      {
        id: "nail-visit",
        label: "손발톱 상태를 상담하고 싶어요",
      },
    ],
  },
] as const;
