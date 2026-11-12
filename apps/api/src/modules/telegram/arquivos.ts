// Download de arquivos enviados ao bot. O link de download contém o token: nunca logar a URL.

export type BaixarArquivo = (caminhoNoTelegram: string) => Promise<Uint8Array>;

export function criarBaixarArquivo(token: string): BaixarArquivo {
  return async (caminho) => {
    const resposta = await fetch(`https://api.telegram.org/file/bot${token}/${caminho}`);
    if (!resposta.ok) {
      throw new Error(`download do arquivo do Telegram falhou (HTTP ${resposta.status})`);
    }
    return new Uint8Array(await resposta.arrayBuffer());
  };
}
