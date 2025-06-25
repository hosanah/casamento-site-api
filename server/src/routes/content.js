const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protectNonGetRoutes } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Obter conteúdo de uma seção específica (público)
router.get('/:section', async (req, res) => {
  try {
    const { section } = req.params;
    
    let content = await prisma.content.findUnique({
      where: { section }
    });
    
    if (!content) {
      // Criar conteúdo padrão se não existir
      const defaultContent = getDefaultContent(section);
      
      content = await prisma.content.create({
        data: {
          section,
          content: defaultContent
        }
      });
    }
    
    // Se for a seção de informações, verificar se está no formato JSON
    if (section === 'informacoes') {
      try {
        // Tentar fazer parse do JSON
        const parsedContent = JSON.parse(content.content);
        // Se for JSON válido, retornar como está
        res.json(content);
      } catch (e) {
        // Se não for JSON, é o formato antigo (texto único)
        // Vamos converter para o novo formato JSON
        const contentText = content.content;
        
        // Extrair seções baseadas em emojis ou títulos
        const extractSection = (emoji, title) => {
          const emojiRegex = new RegExp(`${emoji}[^\\n]*\\n([\\s\\S]*?)(?=\\n\\n|$)`, 'i');
          const titleRegex = new RegExp(`${title}[^\\n]*\\n([\\s\\S]*?)(?=\\n\\n|$)`, 'i');
          
          let match = contentText.match(emojiRegex);
          if (!match) {
            match = contentText.match(titleRegex);
          }
          
          return match ? match[1].trim() : '';
        };
        
        const infoFields = {
          cerimonia: extractSection('📍 Cerimônia', 'Cerimônia'),
          recepcao: extractSection('📍 Recepção', 'Recepção'),
          dressCode: extractSection('👗 Dress Code', 'Dress Code'),
          hospedagem: extractSection('🏨 Hospedagem', 'Hospedagem'),
          transporte: extractSection('🚖 Transporte', 'Transporte'),
          // Campos vazios para os novos atributos
          cerimonia_address: '',
          cerimonia_photo: '',
          recepcao_address: '',
          recepcao_photo: '',
          dressCode_photo: '',
          hospedagem_address: '',
          hospedagem_photo: '',
          transporte_address: '',
          transporte_photo: ''
        };
        
        // Atualizar o conteúdo no banco para o novo formato
        const updatedContent = await prisma.content.update({
          where: { section },
          data: { content: JSON.stringify(infoFields) }
        });
        
        res.json(updatedContent);
      }
    } else {
      res.json(content);
    }
  } catch (error) {
    console.error('Erro ao buscar conteúdo:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Atualizar conteúdo de uma seção (protegido)
router.put('/:section', protectNonGetRoutes, async (req, res) => {
  try {
    const { section } = req.params;
    const { content: contentText } = req.body;
    
    // Validação adicional para a seção de informações
    if (section === 'informacoes') {
      try {
        // Verificar se o conteúdo é um JSON válido
        const parsedContent = JSON.parse(contentText);
        
        // Verificar se todos os campos obrigatórios estão presentes
        const requiredFields = ['cerimonia', 'recepcao', 'dressCode', 'hospedagem', 'transporte'];
        const missingFields = requiredFields.filter(field => !parsedContent.hasOwnProperty(field));
        
        if (missingFields.length > 0) {
          return res.status(400).json({ 
            message: 'Campos obrigatórios ausentes', 
            missingFields 
          });
        }
      } catch (e) {
        return res.status(400).json({ 
          message: 'O conteúdo deve ser um JSON válido para a seção de informações' 
        });
      }
    }
    
    let content = await prisma.content.findUnique({
      where: { section }
    });
    
    if (content) {
      content = await prisma.content.update({
        where: { section },
        data: { content: contentText }
      });
    } else {
      content = await prisma.content.create({
        data: {
          section,
          content: contentText
        }
      });
    }
    
    res.json(content);
  } catch (error) {
    console.error('Erro ao atualizar conteúdo:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Função auxiliar para obter conteúdo padrão
function getDefaultContent(section) {
  if (section === 'informacoes') {
    // Retornar o conteúdo padrão no novo formato JSON
    return JSON.stringify({
      cerimonia: 'Concatedral de São Pedro dos Clérigos – às 19h\nAv. Dantas Barreto, 677 – São José\n(Dica: teremos manobrista nesse ponto)',
      cerimonia_address: 'Av. Dantas Barreto, 677 - São José, Recife - PE',
      cerimonia_photo: 'cerimonia.jpg',
      
      recepcao: 'Espaço Dom – R. das Oficinas, 15 – Pina (dentro da Ecomariner)\n⚠ Importante: no Waze, digite "Ecomariner" (não "Espaço Dom")\nDica: Passando o túnel do RioMar, cruza a Antônio de Gois, primeira direita e depois primeira esquerda.',
      recepcao_address: 'R. das Oficinas, 15 - Pina, Recife - PE',
      recepcao_photo: 'recepcao.jpg',
      
      dressCode: 'Formal – porque esse dia merece um look à altura!',
      dressCode_photo: 'dresscode.jpg',
      
      hospedagem: 'Hotel Luzeiros Recife\nIbis Boa Viagem',
      hospedagem_address: 'Av. Boa Viagem, 5000 - Boa Viagem, Recife - PE',
      hospedagem_photo: 'hospedagem.jpg',
      
      transporte: 'Parceria com TeleTáxi na saída da igreja!',
      transporte_address: 'Av. Dantas Barreto, 677 - São José, Recife - PE',
      transporte_photo: 'transporte.jpg'
    });
  }
  
  const defaultContents = {
    home: 'Estamos muito felizes em ter você aqui!',
    historia: 'Era uma vez… um encontro que mudou tudo.\n\nMarília e Iago se conheceram em 2013, ainda nos tempos de colégio e cursinho no Núcleo. Entre risos nos corredores e a leveza dos dias, uma amizade foi crescendo — com uma ajudinha especial do grande amigo Jorge (obrigado por isso, Jorge!). Mas foi numa noite qualquer, no dia 12 de setembro de 2015, que o destino resolveu agir de vez: um beijo inesperado na boate Seu Regueira selou o começo de algo que, até então, eles ainda não sabiam que seria para a vida inteira.\n\nPoucos dias depois, no dia 18, durante uma saída com amigos, ela comentou que iria para o aniversário da tia. Ele, com aquele jeito leve e descontraído, pediu para ir junto — e disse que queria ser apresentado como "irmão". Foi nessa hora que o coração dela teve certeza: era ele. No dia seguinte, 19 de setembro, começaram oficialmente a namorar. E de lá pra cá, nunca mais se largaram.\n\nDez anos se passaram — anos de descobertas, amadurecimento e construção.\n\nMarília encantou Iago com seu sorriso e com a forma pura e bela com que enxerga o mundo. Ele conquistou Marília com sua alegria e seu jeito leve de viver a vida. Unidos por sonhos em comum, ideais parecidos e um amor regado a fé e cumplicidade, viveram momentos intensos e inesquecíveis.\n\nViveram a dor da distância quando ela foi morar em Brasília, mas seguiram firmes. Celebraram conquistas como a formatura, a aprovação no mestrado e a tão sonhada compra do primeiro apartamento. Estiveram lado a lado nos dias de festa e também nos dias difíceis — inclusive nas despedidas que a vida impôs. Riram, choraram, cresceram. E acima de tudo, nunca deixaram de sonhar juntos.\n\nEles amam estar em família, seja com a dela ou com a dele — porque o amor que os une também transborda em gratidão por aqueles que os cercam.\n\nAgora, exatamente um dia após completarem 10 anos de namoro, estão aqui, prontos para dizer "sim" diante de Deus, da família e dos amigos.\n\nEsse casamento representa um novo ciclo, uma entrega bonita e verdadeira, num tempo em que o amor precisa ser celebrado com fé, com coragem e com esperança. Porque, como diz 1 Coríntios 13:4-7:\n\n"O amor é paciente, o amor é bondoso.\nNão inveja, não se vangloria, não se orgulha.\nNão maltrata, não procura seus interesses,\nnão se ira facilmente, não guarda rancor.\nO amor não se alegra com a injustiça,\nmas se alegra com a verdade.\nTudo sofre, tudo crê, tudo espera, tudo suporta."\n\nE é esse amor que vai com eles, de mãos dadas, rumo à eternidade.'
  };
  
  return defaultContents[section] || '';
}

module.exports = router;
