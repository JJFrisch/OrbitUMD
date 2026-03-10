export interface ApCreditAward {
  scores: number[];
  credits: number;
  equivalency: string;
  genEdCodes: string[];
  courseCodes: string[];
  electiveOnly?: boolean;
  ambiguousCourseChoice?: boolean;
}

export interface ApCreditExam {
  id: string;
  label: string;
  apNumber?: string;
  awards: ApCreditAward[];
}

export const AP_CREDIT_CATALOG: ApCreditExam[] = [
  {
    id: "african-american-studies",
    label: "African American Studies",
    apNumber: "10",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 3, equivalency: "AASP 100 (DSHS and DVUP)", genEdCodes: ["DSHS", "DVUP"], courseCodes: ["AASP100"] },
    ],
  },
  {
    id: "art-history",
    label: "Art History",
    apNumber: "13",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 3, equivalency: "ARTH 200 or ARTH 201 (DSHU and DVUP)", genEdCodes: ["DSHU", "DVUP"], courseCodes: [], ambiguousCourseChoice: true },
    ],
  },
  {
    id: "art-studio-drawing",
    label: "Art Studio - Drawing",
    apNumber: "14",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 3, equivalency: "ARTT 110 (DSSP)", genEdCodes: ["DSSP"], courseCodes: ["ARTT110"] },
    ],
  },
  {
    id: "art-studio-2d",
    label: "Art Studio - 2D Design",
    apNumber: "15",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 3, equivalency: "ARTT 100 (DSSP)", genEdCodes: ["DSSP"], courseCodes: ["ARTT100"] },
    ],
  },
  {
    id: "art-studio-3d",
    label: "Art Studio - 3D Design",
    apNumber: "16",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 3, equivalency: "Lower Level Elective (portfolio review option)", genEdCodes: [], courseCodes: [], electiveOnly: true },
    ],
  },
  {
    id: "biology",
    label: "Biology",
    apNumber: "20",
    awards: [
      { scores: [3], credits: 4, equivalency: "Lab Science (DSNL)", genEdCodes: ["DSNL"], courseCodes: [] },
      { scores: [4, 5], credits: 8, equivalency: "BSCI 160/161 and BSCI 170/171 (DSNL)", genEdCodes: ["DSNL"], courseCodes: ["BSCI160", "BSCI161", "BSCI170", "BSCI171"] },
    ],
  },
  {
    id: "chemistry",
    label: "Chemistry",
    apNumber: "25",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4], credits: 4, equivalency: "CHEM 131 and CHEM 132 (DSNL)", genEdCodes: ["DSNL"], courseCodes: ["CHEM131", "CHEM132"] },
      { scores: [5], credits: 6, equivalency: "CHEM 131/132 (DSNL) and CHEM 271", genEdCodes: ["DSNL"], courseCodes: ["CHEM131", "CHEM132", "CHEM271"] },
    ],
  },
  {
    id: "chinese-language-culture",
    label: "Chinese Language and Culture",
    apNumber: "28",
    awards: [
      { scores: [3, 4, 5], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
    ],
  },
  {
    id: "computer-science-a",
    label: "Computer Science A",
    apNumber: "31",
    awards: [
      { scores: [3], credits: 2, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [5], credits: 4, equivalency: "CMSC 131", genEdCodes: [], courseCodes: ["CMSC131"] },
    ],
  },
  {
    id: "computer-science-principles",
    label: "Computer Science Principles",
    apNumber: "32",
    awards: [
      { scores: [3, 4, 5], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
    ],
  },
  {
    id: "economics-macro",
    label: "Economics - Macro",
    apNumber: "35",
    awards: [
      { scores: [3], credits: 3, equivalency: "History/Social Science (DSHS)", genEdCodes: ["DSHS"], courseCodes: [] },
      { scores: [4, 5], credits: 3, equivalency: "ECON 201 (DSHS)", genEdCodes: ["DSHS"], courseCodes: ["ECON201"] },
    ],
  },
  {
    id: "economics-micro",
    label: "Economics - Micro",
    apNumber: "34",
    awards: [
      { scores: [3], credits: 3, equivalency: "History/Social Science (DSHS)", genEdCodes: ["DSHS"], courseCodes: [] },
      { scores: [4, 5], credits: 3, equivalency: "ECON 200 (DSHS)", genEdCodes: ["DSHS"], courseCodes: ["ECON200"] },
    ],
  },
  {
    id: "english-language-composition",
    label: "English Language and Composition",
    apNumber: "36",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 3, equivalency: "Academic Writing (FSAW)", genEdCodes: ["FSAW"], courseCodes: [] },
    ],
  },
  {
    id: "english-literature-composition",
    label: "English Literature and Composition",
    apNumber: "37",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 6, equivalency: "ENGL 278 and Lower Level Elective", genEdCodes: [], courseCodes: ["ENGL278"] },
    ],
  },
  {
    id: "environmental-science",
    label: "Environmental Science",
    apNumber: "40",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 3, equivalency: "Non-Lab Science (DSNS)", genEdCodes: ["DSNS"], courseCodes: [] },
    ],
  },
  {
    id: "french-language-culture",
    label: "French Language and Culture",
    apNumber: "48",
    awards: [
      { scores: [3], credits: 4, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4], credits: 4, equivalency: "FREN 203", genEdCodes: [], courseCodes: ["FREN203"] },
      { scores: [5], credits: 6, equivalency: "FREN 204 and Lower Level Elective", genEdCodes: [], courseCodes: ["FREN204"] },
    ],
  },
  {
    id: "human-geography",
    label: "Human Geography",
    awards: [
      { scores: [3], credits: 3, equivalency: "History/Social Science (DSHS)", genEdCodes: ["DSHS"], courseCodes: [] },
      { scores: [4, 5], credits: 3, equivalency: "GEOG 202 (DSHS and DVCC)", genEdCodes: ["DSHS", "DVCC"], courseCodes: ["GEOG202"] },
    ],
  },
  {
    id: "german-language-culture",
    label: "German Language and Culture",
    apNumber: "55",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4], credits: 4, equivalency: "GERS 203", genEdCodes: [], courseCodes: ["GERS203"] },
      { scores: [5], credits: 7, equivalency: "GERS 203 and GERS 204", genEdCodes: [], courseCodes: ["GERS203", "GERS204"] },
    ],
  },
  {
    id: "gov-us",
    label: "Government and Politics - US",
    apNumber: "57",
    awards: [
      { scores: [3], credits: 3, equivalency: "History/Social Science (DSHS)", genEdCodes: ["DSHS"], courseCodes: [] },
      { scores: [4, 5], credits: 3, equivalency: "GVPT 170 (DSHS)", genEdCodes: ["DSHS"], courseCodes: ["GVPT170"] },
    ],
  },
  {
    id: "gov-comparative",
    label: "Government and Politics - Comparative",
    apNumber: "58",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 3, equivalency: "GVPT 280", genEdCodes: [], courseCodes: ["GVPT280"] },
    ],
  },
  {
    id: "history-us",
    label: "History - United States",
    apNumber: "07",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4], credits: 3, equivalency: "HIST 200 or HIST 201", genEdCodes: ["DSHS", "DVUP"], courseCodes: [], ambiguousCourseChoice: true },
      { scores: [5], credits: 6, equivalency: "HIST 200 and HIST 201", genEdCodes: ["DSHS", "DVUP"], courseCodes: ["HIST200", "HIST201"] },
    ],
  },
  {
    id: "history-european",
    label: "History - European",
    apNumber: "43",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4], credits: 3, equivalency: "HIST 113 (DSHS)", genEdCodes: ["DSHS"], courseCodes: ["HIST113"] },
      { scores: [5], credits: 6, equivalency: "HIST 112 and HIST 113 (DSHS)", genEdCodes: ["DSHS"], courseCodes: ["HIST112", "HIST113"] },
    ],
  },
  {
    id: "history-world",
    label: "History - World",
    awards: [
      { scores: [3, 4, 5], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
    ],
  },
  {
    id: "italian-language-culture",
    label: "Italian Language and Culture",
    apNumber: "62",
    awards: [
      { scores: [3], credits: 4, equivalency: "ITAL 103", genEdCodes: [], courseCodes: ["ITAL103"] },
      { scores: [4], credits: 4, equivalency: "ITAL 203", genEdCodes: [], courseCodes: ["ITAL203"] },
      { scores: [5], credits: 3, equivalency: "ITAL 204", genEdCodes: [], courseCodes: ["ITAL204"] },
    ],
  },
  {
    id: "japanese-language-culture",
    label: "Japanese Language and Culture",
    apNumber: "64",
    awards: [
      { scores: [3, 4, 5], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
    ],
  },
  {
    id: "latin",
    label: "Latin",
    apNumber: "60",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 4, equivalency: "LATN 201", genEdCodes: [], courseCodes: ["LATN201"] },
    ],
  },
  {
    id: "math-precalculus",
    label: "Math - Precalculus",
    apNumber: "65",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 3, equivalency: "MATH 115 (FSMA)", genEdCodes: ["FSMA"], courseCodes: ["MATH115"] },
    ],
  },
  {
    id: "math-calculus-ab",
    label: "Math - Calculus AB",
    apNumber: "66",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 4, equivalency: "MATH 140 (FSMA and FSAR)", genEdCodes: ["FSMA", "FSAR"], courseCodes: ["MATH140"] },
    ],
  },
  {
    id: "math-calculus-bc",
    label: "Math - Calculus BC",
    apNumber: "68",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 8, equivalency: "MATH 140 (FSMA and FSAR) and MATH 141", genEdCodes: ["FSMA", "FSAR"], courseCodes: ["MATH140", "MATH141"] },
    ],
  },
  {
    id: "math-calculus-bc-subscore",
    label: "Math - Calculus BC with AB Subscore",
    apNumber: "69",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 4, equivalency: "MATH 140 (FSMA and FSAR)", genEdCodes: ["FSMA", "FSAR"], courseCodes: ["MATH140"] },
    ],
  },
  {
    id: "music-theory",
    label: "Music Theory",
    awards: [
      { scores: [3, 4, 5], credits: 3, equivalency: "MUSC 140 (DSSP)", genEdCodes: ["DSSP"], courseCodes: ["MUSC140"] },
    ],
  },
  {
    id: "physics-c-mechanics",
    label: "Physics C - Mechanics",
    apNumber: "80",
    awards: [
      { scores: [3], credits: 4, equivalency: "Lab Science (DSNL)", genEdCodes: ["DSNL"], courseCodes: [] },
      { scores: [4, 5], credits: 4, equivalency: "PHYS 161 and PHYS 261 (DSNL)", genEdCodes: ["DSNL"], courseCodes: ["PHYS161", "PHYS261"] },
    ],
  },
  {
    id: "physics-c-em",
    label: "Physics C - Electricity and Magnetism",
    apNumber: "82",
    awards: [
      { scores: [3], credits: 4, equivalency: "Lab Science (DSNL)", genEdCodes: ["DSNL"], courseCodes: [] },
      { scores: [4, 5], credits: 4, equivalency: "PHYS 260 and PHYS 271 (DSNL)", genEdCodes: ["DSNL"], courseCodes: ["PHYS260", "PHYS271"] },
    ],
  },
  {
    id: "physics-1",
    label: "Physics 1",
    apNumber: "83",
    awards: [
      { scores: [3], credits: 4, equivalency: "Lab Science (DSNL)", genEdCodes: ["DSNL"], courseCodes: [] },
      { scores: [4, 5], credits: 4, equivalency: "PHYS 121 (DSNL)", genEdCodes: ["DSNL"], courseCodes: ["PHYS121"] },
    ],
  },
  {
    id: "physics-2",
    label: "Physics 2",
    apNumber: "84",
    awards: [
      { scores: [3], credits: 4, equivalency: "Lab Science (DSNL)", genEdCodes: ["DSNL"], courseCodes: [] },
      { scores: [4, 5], credits: 4, equivalency: "PHYS 122 (DSNL)", genEdCodes: ["DSNL"], courseCodes: ["PHYS122"] },
    ],
  },
  {
    id: "psychology",
    label: "Psychology",
    apNumber: "85",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 3, equivalency: "PSYC 100 (DSHS or DSNS)", genEdCodes: ["DSHS", "DSNS"], courseCodes: ["PSYC100"] },
    ],
  },
  {
    id: "spanish-language-culture",
    label: "Spanish Language and Culture",
    apNumber: "87",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4], credits: 3, equivalency: "SPAN 204", genEdCodes: [], courseCodes: ["SPAN204"] },
      { scores: [5], credits: 6, equivalency: "SPAN 204 and Lower Level Elective", genEdCodes: [], courseCodes: ["SPAN204"] },
    ],
  },
  {
    id: "spanish-literature-culture",
    label: "Spanish Literature and Culture",
    apNumber: "89",
    awards: [
      { scores: [3, 4], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [5], credits: 6, equivalency: "SPAN 207 (DSHU) and Lower Level Elective", genEdCodes: ["DSHU"], courseCodes: ["SPAN207"] },
    ],
  },
  {
    id: "statistics",
    label: "Statistics",
    apNumber: "90",
    awards: [
      { scores: [3], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
      { scores: [4, 5], credits: 3, equivalency: "STAT 100 (FSMA and FSAR)", genEdCodes: ["FSMA", "FSAR"], courseCodes: ["STAT100"] },
    ],
  },
  {
    id: "ap-research",
    label: "AP Research",
    awards: [
      { scores: [3, 4, 5], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
    ],
  },
  {
    id: "ap-seminar",
    label: "AP Seminar",
    awards: [
      { scores: [3, 4, 5], credits: 3, equivalency: "Lower Level Elective", genEdCodes: [], courseCodes: [], electiveOnly: true },
    ],
  },
];

export function getApAward(examId: string, score: number): ApCreditAward | null {
  const exam = AP_CREDIT_CATALOG.find((entry) => entry.id === examId);
  if (!exam) return null;
  return exam.awards.find((award) => award.scores.includes(score)) ?? null;
}
