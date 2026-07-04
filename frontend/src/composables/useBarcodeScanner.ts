import { ref } from "vue";

// Formatos comuns em produtos de supermercado brasileiro.
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
  }
}

// Carrega o zxing (sob demanda) e monta os hints compartilhados entre o modo contínuo
// (iniciar) e o disparo único (capturarFrame): restringir aos 5 formatos 1D relevantes
// deixa cada tentativa mais rápida, e TRY_HARDER pede mais esforço por frame — juntos
// priorizam acerto sobre velocidade.
async function construirLeitorZxing() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hints = new Map<number, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return { BrowserMultiFormatReader, hints };
}

// Scanner de câmera: roda a BarcodeDetector API nativa (quando presente) e o
// @zxing/browser (carregado sob demanda) em paralelo — quem detectar primeiro vence.
//
// Não dá pra confiar só na presença de `window.BarcodeDetector`: em várias instalações
// de Chrome desktop (observado em Windows) a API existe mas o backend de detecção por
// trás dela nunca detecta nada, sem lançar erro — falha silenciosa. Rodar o zxing (decoder
// 100% em JS, sem depender de serviço nativo do SO) em paralelo garante uma tentativa real
// de verdade em qualquer navegador, sem custo perceptível (o zxing só entra em ação de
// fato se a API nativa não resolver primeiro).
export function useBarcodeScanner() {
  const ativo = ref(false);
  const erro = ref<string | null>(null);
  const capturando = ref(false);

  let stream: MediaStream | null = null;
  let framePendente: number | null = null;
  let zxingControls: { stop(): void } | null = null;
  let detectado = false;

  async function iniciar(videoEl: HTMLVideoElement, onDetectado: (codigo: string) => void) {
    erro.value = null;
    detectado = false;
    try {
      // Resolução alta é pedida explicitamente: sem isso, muitas webcams (principalmente
      // de notebook) negociam algo baixo por padrão (ex: 640x480), insuficiente para
      // resolver as barras finas de um EAN-13 a qualquer distância razoável da câmera.
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
    } catch {
      erro.value = "Permissão de câmera negada ou indisponível";
      return;
    }

    videoEl.srcObject = stream;
    await videoEl.play();
    ativo.value = true;

    function reportar(codigo: string) {
      if (detectado) return;
      detectado = true;
      onDetectado(codigo);
    }

    if ("BarcodeDetector" in window && window.BarcodeDetector) {
      const detector = new window.BarcodeDetector({ formats: FORMATOS });
      const detectarFrame = async () => {
        if (!ativo.value || detectado) return;
        try {
          const resultados = await detector.detect(videoEl);
          if (resultados.length > 0) {
            reportar(resultados[0].rawValue);
            return;
          }
        } catch {
          // frame ilegível — tenta de novo no próximo
        }
        framePendente = requestAnimationFrame(detectarFrame);
      };
      framePendente = requestAnimationFrame(detectarFrame);
    }

    const { BrowserMultiFormatReader, hints } = await construirLeitorZxing();
    const leitor = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
    zxingControls = await leitor.decodeFromVideoElement(videoEl, (resultado) => {
      if (resultado) reportar(resultado.getText());
    });
  }

  // Fallback temporário: captura o frame atual (parado, sem o ruído do vídeo em
  // movimento) e tenta decodificar uma única vez. Dá pro usuário tempo de mirar/focar
  // antes de disparar, ao contrário da detecção contínua que decodifica sob pressão de
  // tempo a cada frame — útil enquanto a detecção em tempo real não é confiável (ex:
  // webcam de notebook com foco fixo). Retorna null se nenhum código foi identificado
  // nessa foto (não é erro — o usuário pode tentar de novo).
  async function capturarFrame(videoEl: HTMLVideoElement): Promise<string | null> {
    if (capturando.value) return null;
    capturando.value = true;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx || canvas.width === 0 || canvas.height === 0) return null;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      if ("BarcodeDetector" in window && window.BarcodeDetector) {
        try {
          const detector = new window.BarcodeDetector({ formats: FORMATOS });
          const resultados = await detector.detect(canvas);
          if (resultados.length > 0) return resultados[0].rawValue;
        } catch {
          // segue pro zxing
        }
      }

      const { BrowserMultiFormatReader, hints } = await construirLeitorZxing();
      const leitor = new BrowserMultiFormatReader(hints);
      try {
        return leitor.decodeFromCanvas(canvas).getText();
      } catch {
        return null;
      }
    } finally {
      capturando.value = false;
    }
  }

  function parar() {
    ativo.value = false;
    if (framePendente !== null) {
      cancelAnimationFrame(framePendente);
      framePendente = null;
    }
    zxingControls?.stop();
    zxingControls = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  return { ativo, erro, capturando, iniciar, capturarFrame, parar };
}
