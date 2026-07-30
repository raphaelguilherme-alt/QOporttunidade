export type PublicPropertyImage = {
  originalUrl: string;
  displayUrl: string;
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
  position: number;
  alt: string;
};

export type PublicCampaignProperty = {
  code: string;
  campaignStatus: "available" | "sold";
  title: string;
  locationLabel: string;
  neighborhood: string;
  beach: string | null;
  city: string;
  state: string;
  propertyType: string;
  salePrice: number | null;
  originalPrice: number | null;
  fairPrice: number | null;
  effectivePrice: number | null;
  downPayment: number | null;
  cashPrice: number | null;
  savings: number | null;
  discountPercentage: number;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  usableArea: number | null;
  images: PublicPropertyImage[];
  features: string[];
  updatedAt: string | null;
};
