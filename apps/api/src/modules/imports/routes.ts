import { mapearImportacaoSchema } from '@giro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requisicaoInvalida } from '../../erros';
import { EXTENSOES_ACEITAS, extensaoAceita } from './arquivo';
import type { ServicoImportacoes } from './service';

const paramsId = z.object({ id: z.coerce.number().int().positive() });

export type ServicoImportacoesRotas = Pick<
  ServicoImportacoes,
  'importar' | 'reprocessar' | 'mapear' | 'listar' | 'detalhe'
>;

export function rotasImportacoes(app: FastifyInstance, servico: ServicoImportacoesRotas) {
  // upload do arquivo exportado do PDV (multipart, campo "arquivo")
  app.post('/stores/:id/imports', async (request, reply) => {
    const { id: lojaId } = paramsId.parse(request.params);
    const arquivo = await request.file();
    if (!arquivo) throw requisicaoInvalida('Envie o arquivo no campo "arquivo" (multipart).');
    if (!extensaoAceita(arquivo.filename)) {
      throw requisicaoInvalida(`Formato não suportado. Use ${EXTENSOES_ACEITAS.join(', ')}.`);
    }
    const conteudo = await arquivo.toBuffer();
    const nome = arquivo.filename.toLowerCase();
    const resumo = await servico.importar({
      lojaId,
      origem: nome.endsWith('.xlsx') || nome.endsWith('.xls') ? 'pdv_xlsx' : 'pdv_csv',
      nomeArquivo: arquivo.filename,
      conteudo: new Uint8Array(conteudo),
    });
    // 201 mesmo quando o arquivo não pôde ser lido: a importação foi registrada com status "error"
    return reply.code(201).send(resumo);
  });

  app.get('/stores/:id/imports', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.listar(id);
  });

  app.get('/imports/:id', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.detalhe(id);
  });

  app.post('/imports/:id/map', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.mapear(id, mapearImportacaoSchema.parse(request.body));
  });

  // reprocessa o arquivo guardado (depois de mapear colunas, por exemplo)
  app.post('/imports/:id/reprocess', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.reprocessar(id);
  });
}
