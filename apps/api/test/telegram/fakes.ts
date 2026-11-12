import { vi, type Mock } from 'vitest';
import type { ServicosBot } from '../../src/modules/telegram/dependencias';

/** fake que falha se for chamado; o tipo é o da função real para o teste poder usar mockResolvedValue */
function naoUsado<F extends (...args: never[]) => Promise<unknown>>(nome: string) {
  return vi.fn(() =>
    Promise.reject(new Error(`${nome}: não usado neste teste`)),
  ) as unknown as Mock<F>;
}

/** serviços do bot que um teste não exercita; sobrescreva os que ele usa */
export function servicosNaoUsados() {
  return {
    respostas: {
      sugestaoAtiva: naoUsado<ServicosBot['respostas']['sugestaoAtiva']>('respostas.sugestaoAtiva'),
      aceitarTudo: naoUsado<ServicosBot['respostas']['aceitarTudo']>('respostas.aceitarTudo'),
      ajustar: naoUsado<ServicosBot['respostas']['ajustar']>('respostas.ajustar'),
      definirMotivo: naoUsado<ServicosBot['respostas']['definirMotivo']>('respostas.definirMotivo'),
      definirNota: naoUsado<ServicosBot['respostas']['definirNota']>('respostas.definirNota'),
    },
    registros: {
      registrarPerda: naoUsado<ServicosBot['registros']['registrarPerda']>(
        'registros.registrarPerda',
      ),
      registrarFalta: naoUsado<ServicosBot['registros']['registrarFalta']>(
        'registros.registrarFalta',
      ),
      registrarContagem: naoUsado<ServicosBot['registros']['registrarContagem']>(
        'registros.registrarContagem',
      ),
    },
    inbox: { registrar: naoUsado<ServicosBot['inbox']['registrar']>('inbox.registrar') },
    sessoes: {
      obter: vi.fn(() => Promise.resolve(null)),
      salvar: naoUsado<ServicosBot['sessoes']['salvar']>('sessoes.salvar'),
      limpar: naoUsado<ServicosBot['sessoes']['limpar']>('sessoes.limpar'),
    },
  };
}
