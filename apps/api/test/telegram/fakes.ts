import { vi } from 'vitest';

const naoUsado = (nome: string) =>
  vi.fn(() => Promise.reject(new Error(`${nome}: não usado neste teste`)));

/** serviços do bot que um teste não exercita; sobrescreva os que ele usa */
export function servicosNaoUsados() {
  return {
    respostas: {
      sugestaoAtiva: naoUsado('respostas.sugestaoAtiva'),
      aceitarTudo: naoUsado('respostas.aceitarTudo'),
      ajustar: naoUsado('respostas.ajustar'),
      definirMotivo: naoUsado('respostas.definirMotivo'),
      definirNota: naoUsado('respostas.definirNota'),
    },
    registros: {
      registrarPerda: naoUsado('registros.registrarPerda'),
      registrarFalta: naoUsado('registros.registrarFalta'),
      registrarContagem: naoUsado('registros.registrarContagem'),
    },
    inbox: { registrar: naoUsado('inbox.registrar') },
    sessoes: {
      obter: vi.fn(() => Promise.resolve(null)),
      salvar: naoUsado('sessoes.salvar'),
      limpar: naoUsado('sessoes.limpar'),
    },
  };
}
