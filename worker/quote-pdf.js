import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const money = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const quoteLink = token => `https://forgecon.com.br/proposta/#${token}`;

// One renderer owns both the original document and the emailed acceptance copy.
export async function quotePdf(row) {
  const document = JSON.parse(row.document);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page;
  let y;
  const clean = value => [...String(value)].map(char => {
    try { regular.encodeText(char); return char; } catch { return '?'; }
  }).join('');
  function newPage() {
    page = pdf.addPage([595, 842]); y = 792;
    page.drawText('FORGECON | IMPRESSÃO 3D', { x: 42, y, font: bold, size: 16, color: rgb(.38,.2,.75) });
    y -= 30;
  }
  function line(value, strong = false, size = 10) {
    const font = strong ? bold : regular;
    const paragraphs = clean(value).split('\n');
    for (const paragraph of paragraphs) {
      let text = '';
      for (const char of paragraph) {
        if (font.widthOfTextAtSize(text + char, size) > 510) { draw(text); text = ''; }
        text += char;
      }
      draw(text);
    }
    function draw(text) {
      if (y < 56) newPage();
      page.drawText(text, { x: 42, y, font, size }); y -= size + 6;
    }
  }
  newPage();
  line(`ORÇAMENTO ${row.number}`, true, 15);
  line(`Emitido em ${document.date} | Válido até ${document.validUntil}`);
  line(`Cliente: ${document.client}`, true);
  if (document.phone) line(`Contato: ${document.phone}`);
  y -= 10;
  document.items.forEach((item, i) => {
    line(`${i + 1}. ${item.name}`, true);
    if (item.description) line(item.description);
    line(`${item.quantity} un. | Unitário: ${money(item.unitCents)} | Subtotal: ${money(item.totalCents)}`);
    y -= 8;
  });
  line(`TOTAL: ${money(row.total_cents)}`, true, 16);
  line(`Recebimento: ${document.delivery === 'pickup' ? 'Retirada no local - sem frete' : 'Entrega'}`);
  line(document.deliveryDetails);
  line(`Pagamento: ${document.payment}`);
  line(`Observações: ${document.notes || 'A combinar'}`);
  y -= 10;
  line('Consultar orçamento e responder:', true);
  // pdf-lib annotations make this a clickable link in PDF readers.
  const link = quoteLink(row.token);
  if (y < 85) newPage();
  const { PDFName, PDFString } = await import('pdf-lib');
  const annotation = pdf.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [42, y - 6, 553, y + 12], Border: [0,0,0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(link) },
  });
  const annotations = page.node.Annots();
  if (annotations) annotations.push(pdf.context.register(annotation));
  else page.node.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.register(annotation)]));
  line(link, false, 8);
  line(`Integridade do orçamento (SHA-256): ${row.document_hash}`, false, 8);
  if (row.response) {
    const response = JSON.parse(row.response);
    y -= 12;
    line(response.action === 'accepted' ? 'ACEITE ELETRÔNICO' : 'RESPOSTA DO CLIENTE', true, 14);
    line(`Resposta: ${response.action === 'accepted' ? 'Aprovado' : response.action === 'declined' ? 'Recusado' : 'Ajustes solicitados'}`);
    line(`Por ${response.name} (${response.email})`);
    line(`Em ${new Date(response.at * 1000).toLocaleString('pt-BR', { timeZone: 'America/Recife' })}`);
    line(`Código: ${response.code} | IP registrado: ${response.ip || 'Indisponível'}`);
    if (response.message) line(`Mensagem: ${response.message}`);
    line(`Hash do registro (SHA-256): ${row.receipt_hash}`, false, 8);
    line('E-mail confirmado por código. O hash permite verificar a integridade do registro.', false, 8);
  }
  pdf.setTitle(`Orçamento ${row.number}`);
  return pdf.save();
}
