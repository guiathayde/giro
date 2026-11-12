// Eventos de calendário (feriado, feira) que mexem na previsão de venda.
import type { EventoCalendario, FiltroPeriodo, NovoEvento } from '@giro/shared';
import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { calendarEvents, stores } from '../../db/schema';
import { hojeNoFuso, somarDias } from '../../datas';
import { naoEncontrado } from '../../erros';

const DIAS_PADRAO = 60;

function paraDto(e: typeof calendarEvents.$inferSelect): EventoCalendario {
  return {
    id: e.id,
    lojaId: e.storeId,
    data: e.eventDate,
    tipo: e.kind,
    descricao: e.label,
    fatorDemanda: e.demandFactor,
  };
}

export function criarServicoCalendario(db: Db) {
  return {
    /** eventos da loja e os globais (store_id null); padrão: de hoje até +60 dias */
    async listar(lojaId: number, filtro: FiltroPeriodo): Promise<EventoCalendario[]> {
      const [loja] = await db.select().from(stores).where(eq(stores.id, lojaId));
      if (!loja) throw naoEncontrado('Loja não encontrada');
      const from = filtro.from ?? hojeNoFuso(loja.timezone);
      const to = filtro.to ?? somarDias(from, DIAS_PADRAO);
      const linhas = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            or(eq(calendarEvents.storeId, lojaId), isNull(calendarEvents.storeId)),
            gte(calendarEvents.eventDate, from),
            lte(calendarEvents.eventDate, to),
          ),
        )
        .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.id));
      return linhas.map(paraDto);
    },

    async criar(dados: NovoEvento): Promise<EventoCalendario> {
      const lojaId = dados.lojaId ?? null;
      if (lojaId !== null) {
        const [loja] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, lojaId));
        if (!loja) throw naoEncontrado('Loja não encontrada');
      }
      const [evento] = await db
        .insert(calendarEvents)
        .values({
          storeId: lojaId,
          eventDate: dados.data,
          kind: dados.tipo,
          label: dados.descricao,
          demandFactor: dados.fatorDemanda ?? 1,
        })
        .returning();
      return paraDto(evento!);
    },

    async remover(id: number): Promise<void> {
      const removidos = await db
        .delete(calendarEvents)
        .where(eq(calendarEvents.id, id))
        .returning({ id: calendarEvents.id });
      if (removidos.length === 0) throw naoEncontrado('Evento não encontrado');
    },
  };
}

export type ServicoCalendario = ReturnType<typeof criarServicoCalendario>;
