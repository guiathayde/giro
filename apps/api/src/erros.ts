/** Erro com status HTTP, lançado pelos serviços de domínio e convertido pelo error handler. */
export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ErroHttp';
  }
}

export const naoEncontrado = (mensagem: string) => new ErroHttp(404, mensagem);
export const requisicaoInvalida = (mensagem: string) => new ErroHttp(400, mensagem);
