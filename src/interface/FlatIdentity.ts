// Tipo para la respuesta de identidad aplanada que esperamos
export interface FlatIdentity {
  userId: string;
  fullName: string;
  email: string;
  isMember: boolean;
  patronStatus: string | null;
  tiers: { id: string; title: string }[];
}
