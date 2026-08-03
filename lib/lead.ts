import { z } from "zod";

const digits = (value: string) => value.replace(/\D/g, "");

export const leadRequestSchema = z.object({
  name: z.string().trim().min(2).max(80)
    .refine(value => /[\p{L}]/u.test(value))
    .refine(value => !/[<>\u0000-\u001F\u007F]/u.test(value)),
  phone: z.string().max(30).transform(digits).refine(value => /^[1-9]{2}9\d{8}$/.test(value)),
  propertyCode: z.string().trim().regex(/^\d{1,20}$/),
  website: z.string().max(200).optional().default(""),
  tokenAntibot: z.string().max(2048).optional().default(""),
  formStartedAt: z.number().int().positive(),
}).strict();

export const formatBrazilianPhone = (value: string) => {
  const phone = digits(value).slice(0, 11);
  if (phone.length <= 2) return phone;
  if (phone.length <= 7) return `(${phone.slice(0, 2)}) ${phone.slice(2)}`;
  return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
};

export function buildImobziLead(input: { name: string; phone: string; propertyCode: string }) {
  const ddd = input.phone.slice(0, 2);
  const localPhone = input.phone.slice(2);
  return {
    leadOrigin: "Site",
    title: "Site Q Oportunidades",
    timestamp: new Date().toISOString(),
    clientListingId: input.propertyCode,
    name: input.name,
    ddd,
    phone: localPhone,
    phoneNumber: `+55${input.phone}`,
    country_code: "+55",
    alpha2Code: "BR",
    message: `Lead vindo do site Q Oportunidades. Imóvel de interesse: código ${input.propertyCode}.`,
  };
}
