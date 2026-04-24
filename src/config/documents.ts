/**
 * 支持的证件类型 × 地区 × 活体模式静态数据。
 * 供 Tool `tencent_ekyc_get_supported_documents` 直接返回。
 *
 * 权威来源：01_docs/documents-matrix.md
 */

export type LivenessMode = "SILENT" | "ACTION" | "REFLECT" | "LIP" | "NUMBER";

export interface DocumentType {
  type: string;
  name: string;
  liveness_modes: LivenessMode[];
  sdk_model?: string;
}

export interface Region {
  code: string;
  name: string;
  recommended_endpoint: string;
  documents: DocumentType[];
}

export const SUPPORTED_LIVENESS_MODES: LivenessMode[] = [
  "SILENT",
  "ACTION",
  "REFLECT",
  "LIP",
  "NUMBER",
];

export const REGIONS: Region[] = [
  {
    code: "ID",
    name: "Indonesia",
    recommended_endpoint: "ap-singapore",
    documents: [
      { type: "KTP", name: "Kartu Tanda Penduduk", liveness_modes: ["SILENT", "ACTION"], sdk_model: "IndonesiaIDCard" },
      { type: "DRIVING_LICENSE", name: "Indonesian Driver's License (SIM)", liveness_modes: ["SILENT", "ACTION"], sdk_model: "IndonesiaDrivingLicense" },
    ],
  },
  {
    code: "MY",
    name: "Malaysia",
    recommended_endpoint: "ap-singapore",
    documents: [
      { type: "MYKAD", name: "MyKad (National ID)", liveness_modes: ["SILENT", "ACTION"], sdk_model: "MLIDCard" },
      { type: "MYKAD_TEMP", name: "MyKad Temporary", liveness_modes: ["SILENT", "ACTION"] },
    ],
  },
  {
    code: "PH",
    name: "Philippines",
    recommended_endpoint: "ap-singapore",
    documents: [
      { type: "UMID", name: "Unified Multi-Purpose ID", liveness_modes: ["SILENT", "ACTION"] },
      { type: "SSS", name: "Social Security System ID", liveness_modes: ["SILENT", "ACTION"] },
      { type: "PHILID", name: "Philippine National ID", liveness_modes: ["SILENT", "ACTION"] },
      { type: "DRIVING_LICENSE", name: "Philippine Driver's License", liveness_modes: ["SILENT", "ACTION"], sdk_model: "PhilippinesDrivingLicense" },
      { type: "PASSPORT", name: "Philippine Passport", liveness_modes: ["SILENT", "ACTION"] },
    ],
  },
  {
    code: "TH",
    name: "Thailand",
    recommended_endpoint: "ap-bangkok",
    documents: [
      { type: "NATIONAL_ID", name: "Thai National ID Card", liveness_modes: ["SILENT", "ACTION"], sdk_model: "ThailandIDCard" },
    ],
  },
  {
    code: "SG",
    name: "Singapore",
    recommended_endpoint: "ap-singapore",
    documents: [
      { type: "NRIC", name: "Singapore NRIC / FIN", liveness_modes: ["SILENT", "ACTION"], sdk_model: "SingaporeIDCard" },
    ],
  },
  {
    code: "VN",
    name: "Vietnam",
    recommended_endpoint: "ap-singapore",
    documents: [
      { type: "NATIONAL_ID", name: "Vietnamese National ID", liveness_modes: ["SILENT", "ACTION"] },
      { type: "CITIZEN_ID", name: "Vietnamese Citizen ID (chip card)", liveness_modes: ["SILENT", "ACTION"] },
    ],
  },
  {
    code: "HK",
    name: "Hong Kong",
    recommended_endpoint: "ap-hongkong",
    documents: [
      { type: "HKID", name: "Hong Kong Identity Card", liveness_modes: ["SILENT", "ACTION"], sdk_model: "HKIDCard" },
    ],
  },
  {
    code: "MO",
    name: "Macau",
    recommended_endpoint: "ap-hongkong",
    documents: [
      { type: "BIR", name: "Macau BIR / CI", liveness_modes: ["SILENT", "ACTION"], sdk_model: "MacaoIDCard" },
    ],
  },
  {
    code: "TW",
    name: "Taiwan",
    recommended_endpoint: "ap-hongkong",
    documents: [
      { type: "TW_ID", name: "Taiwan Resident ID Card", liveness_modes: ["SILENT", "ACTION"], sdk_model: "TaiWanIDCard" },
    ],
  },
  {
    code: "HMT",
    name: "HK/MO/TW Residents in Mainland",
    recommended_endpoint: "ap-hongkong",
    documents: [
      { type: "HMT_PERMIT", name: "HK/MO/TW Residence Permit", liveness_modes: ["SILENT", "ACTION"], sdk_model: "HMTPermit" },
    ],
  },
  {
    code: "BR",
    name: "Brazil",
    recommended_endpoint: "sa-saopaulo",
    documents: [
      { type: "RG", name: "Registro Geral", liveness_modes: ["SILENT", "ACTION"] },
      { type: "CPF", name: "Cadastro de Pessoas Físicas", liveness_modes: [] },
      { type: "CNH", name: "Carteira Nacional de Habilitação", liveness_modes: ["SILENT", "ACTION"] },
    ],
  },
  {
    code: "JP",
    name: "Japan",
    recommended_endpoint: "ap-singapore",
    documents: [
      { type: "JP_ID", name: "Japanese Individual Number Card", liveness_modes: ["SILENT", "ACTION"], sdk_model: "JapanIDCard" },
    ],
  },
  {
    code: "NG",
    name: "Nigeria",
    recommended_endpoint: "ap-singapore",
    documents: [
      { type: "NIN", name: "Nigerian National ID", liveness_modes: ["SILENT", "ACTION"], sdk_model: "NigeriaIDCard" },
      { type: "DRIVING_LICENSE", name: "Nigerian Driver's License", liveness_modes: ["SILENT", "ACTION"], sdk_model: "NigeriaDrivingLicense" },
    ],
  },
  {
    code: "PK",
    name: "Pakistan",
    recommended_endpoint: "ap-singapore",
    documents: [
      { type: "CNIC", name: "Pakistan CNIC", liveness_modes: ["SILENT", "ACTION"], sdk_model: "PakistanIDCard" },
      { type: "DRIVING_LICENSE", name: "Pakistan Driving License", liveness_modes: ["SILENT", "ACTION"], sdk_model: "PakistanDrivingLicense" },
    ],
  },
  {
    code: "BD",
    name: "Bangladesh",
    recommended_endpoint: "ap-singapore",
    documents: [
      { type: "NID", name: "Bangladesh National ID", liveness_modes: ["SILENT", "ACTION"], sdk_model: "BangladeshIDCard" },
    ],
  },
  {
    code: "INTL",
    name: "International",
    recommended_endpoint: "ap-singapore",
    documents: [
      { type: "PASSPORT", name: "International Passport (MRZ)", liveness_modes: ["SILENT", "ACTION"], sdk_model: "InternationalIDPassport" },
    ],
  },
];

export function getDocumentStats() {
  const total_document_types = REGIONS.reduce((sum, r) => sum + r.documents.length, 0);
  return {
    total_document_types,
    total_regions: REGIONS.length,
    supported_liveness_modes: SUPPORTED_LIVENESS_MODES,
  };
}

export function getRegions(region?: string): Region[] {
  if (!region || region === "ALL") return REGIONS;
  return REGIONS.filter((r) => r.code === region.toUpperCase());
}
