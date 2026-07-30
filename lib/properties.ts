export type PropertyStatus = "available" | "sold";
export type PropertyType = "Apartamento" | "Casa" | "Cobertura";

export type PropertyRecord = {
  id: string;
  code: string;
  title: string;
  neighborhood: string;
  city: string;
  type: PropertyType;
  status: PropertyStatus;
  originalPrice: number;
  campaignPrice: number;
  campaignValidUntil?: string;
  statusUpdatedAt: string;
  soldAt?: string;
  bedrooms: number;
  suites: number;
  bathrooms: number;
  parkingSpaces: number;
  usableArea: number;
  images: string[];
  tags: string[];
  description: string;
  sourceUrl: string;
  whatsappMessage: string;
  tour360Url?: string;
  coordinates?: { latitude: number; longitude: number };
};

export type CampaignProperty = PropertyRecord & {
  discountPercentage: number;
  savingsAmount: number;
};

const calculateCampaignFields = (property: PropertyRecord): CampaignProperty => {
  if (property.originalPrice <= 0 || property.campaignPrice <= 0) {
    throw new Error(`${property.code}: preços devem ser positivos.`);
  }
  if (property.originalPrice <= property.campaignPrice) {
    throw new Error(`${property.code}: preço original deve ser maior que o preço do feirão.`);
  }
  if (property.status === "sold" && !property.soldAt) {
    throw new Error(`${property.code}: imóvel vendido precisa informar soldAt.`);
  }
  return {
    ...property,
    discountPercentage:
      ((property.originalPrice - property.campaignPrice) / property.originalPrice) * 100,
    savingsAmount: property.originalPrice - property.campaignPrice,
  };
};

/*
 * FONTE ÚNICA DO CATÁLOGO.
 * Importar aqui os aproximadamente 60 registros verificados da API/CMS.
 * Não há fixtures comerciais: o material recebido ainda não informa pares de
 * originalPrice/campaignPrice, códigos, status e demais campos obrigatórios.
 */
const propertyRecords: PropertyRecord[] = [];

export const properties = propertyRecords.map(calculateCampaignFields);

export const catalogTotals = (items: CampaignProperty[]) => ({
  totalProperties: items.length,
  availableCount: items.filter((item) => item.status === "available").length,
  soldCount: items.filter((item) => item.status === "sold").length,
});

export const availableFirst = (items: CampaignProperty[]) =>
  [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === "available" ? -1 : 1;
    return Date.parse(b.statusUpdatedAt) - Date.parse(a.statusUpdatedAt);
  });

export const findSimilar = (
  sold: CampaignProperty,
  items: CampaignProperty[],
  limit = 3,
) =>
  items
    .filter((item) => item.status === "available" && item.id !== sold.id)
    .map((item) => ({
      item,
      score:
        Number(item.neighborhood === sold.neighborhood) * 3 +
        Number(item.type === sold.type) * 2 -
        Math.abs(item.campaignPrice - sold.campaignPrice) /
          Math.max(sold.campaignPrice, 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
