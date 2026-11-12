// O que o bot precisa dos módulos de domínio. Os handlers dependem só destas interfaces,
// para serem testados com fakes (sem banco e sem Telegram).
import type {
  Contagem,
  Falta,
  Item,
  ItemSugestao,
  MotivoResposta,
  NovaContagem,
  NovaFalta,
  NovaPerda,
  Perda,
  ResumoImportacao,
  Sugestao,
} from '@giro/shared';
import type { BotConfig, Context } from 'grammy';
import type { EntradaImportacao } from '../imports/service';
import type { NovaMensagemInbox } from '../inbox/service';
import type { Ajuste, ResultadoAjuste } from '../respostas/service';
import type { LojaDoChat } from '../stores/service';
import type { BaixarArquivo } from './arquivos';

export type { Ajuste, ResultadoAjuste };

/** conversa em andamento com o dono de uma loja */
export interface SessaoBot {
  chatId: number;
  lojaId: number;
  /** ajuste: esperando linhas "N qtd"; nota: esperando o texto do motivo "outro" */
  modo: 'ajuste' | 'nota';
  sugestaoId: number;
  /** item que espera a nota (modo nota) */
  itemSugestaoId: number | null;
}

export interface ServicosBot {
  lojas: {
    vincularChat: (codigo: string, chatId: number) => Promise<LojaDoChat | null>;
    lojaDoChat: (chatId: number) => Promise<LojaDoChat | null>;
    itens: (lojaId: number) => Promise<Item[]>;
  };
  importacoes: {
    importar: (entrada: EntradaImportacao) => Promise<ResumoImportacao>;
  };
  respostas: {
    sugestaoAtiva: (lojaId: number) => Promise<Sugestao | null>;
    aceitarTudo: (sugestaoId: number) => Promise<Sugestao>;
    ajustar: (sugestaoId: number, ajustes: Ajuste[]) => Promise<ResultadoAjuste>;
    definirMotivo: (itemSugestaoId: number, motivo: MotivoResposta) => Promise<ItemSugestao>;
    definirNota: (itemSugestaoId: number, nota: string) => Promise<ItemSugestao>;
  };
  registros: {
    registrarPerda: (lojaId: number, dados: NovaPerda) => Promise<Perda>;
    registrarFalta: (lojaId: number, dados: NovaFalta) => Promise<Falta>;
    registrarContagem: (lojaId: number, dados: NovaContagem) => Promise<Contagem>;
  };
  inbox: {
    registrar: (dados: NovaMensagemInbox) => Promise<void>;
  };
  sessoes: {
    obter: (chatId: number) => Promise<SessaoBot | null>;
    salvar: (sessao: SessaoBot) => Promise<void>;
    limpar: (chatId: number) => Promise<void>;
  };
}

export interface DependenciasBot extends ServicosBot {
  baixarArquivo: BaixarArquivo;
  /** erros inesperados; o dono sempre recebe uma resposta mesmo assim */
  registrarErro: (err: unknown, contexto: string) => void;
  config?: BotConfig<Context>;
}
