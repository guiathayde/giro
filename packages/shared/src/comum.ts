import { z } from 'zod';

/** Data de calendário 'AAAA-MM-DD', sem fuso horário. */
export const dataIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD');

/** Filtro de período nas listagens (?from=&to=), datas inclusivas. */
export const filtroPeriodoSchema = z.object({
  from: dataIsoSchema.optional(),
  to: dataIsoSchema.optional(),
});
export type FiltroPeriodo = z.infer<typeof filtroPeriodoSchema>;
