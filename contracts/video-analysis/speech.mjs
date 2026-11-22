/** Canonical audio upload boundary. The optional authenticated /resolve route
 * accepts one current share link; platform video bytes remain on the desktop. */
export const VIDEO_ANALYSIS_SPEECH_PREFIX='/v1/video-analysis/speech';
export const VIDEO_ANALYSIS_SPEECH_TOKEN_HEADER='x-cococut-speech-token';
export const VIDEO_ANALYSIS_AUDIO_SHA256_HEADER='x-cococut-audio-sha256';
export const VIDEO_ANALYSIS_GENERATION_HEADER='x-cococut-analysis-generation';
export const VIDEO_ANALYSIS_SPEECH_MAX_AUDIO_BYTES=60*1024*1024;
export const VIDEO_ANALYSIS_SPEECH_MAX_SECONDS=1800;
export const VIDEO_ANALYSIS_SPEECH_LEASE_MS=15*60*1000;
export const VIDEO_ANALYSIS_SPEECH_STATUSES=Object.freeze(['uploading','queued','running','succeeded','failed','cancelled']);
export const videoAnalysisSpeechId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export const videoAnalysisAudioSha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const invalid=()=>Object.assign(Error('仅支持16kHz单声道PCM16标准音频。'),{code:'VIDEO_ANALYSIS_SPEECH_AUDIO_INVALID',status:400});
export function canonicalSpeechWavHeader(dataBytes){
 if(!Number.isSafeInteger(dataBytes)||dataBytes<2||dataBytes%2||dataBytes>32000*VIDEO_ANALYSIS_SPEECH_MAX_SECONDS||dataBytes+44>VIDEO_ANALYSIS_SPEECH_MAX_AUDIO_BYTES)throw invalid();
 const bytes=new Uint8Array(44),view=new DataView(bytes.buffer),put=(offset,text)=>{for(let i=0;i<text.length;i++)bytes[offset+i]=text.charCodeAt(i);};
 put(0,'RIFF');view.setUint32(4,dataBytes+36,true);put(8,'WAVE');put(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);put(36,'data');view.setUint32(40,dataBytes,true);return bytes;
}
export function validateCanonicalSpeechWav(header,totalBytes){
 if(!(header instanceof Uint8Array)||header.byteLength<44||!Number.isSafeInteger(totalBytes))throw invalid();
 const expected=canonicalSpeechWavHeader(totalBytes-44);
 for(let i=0;i<44;i++)if(header[i]!==expected[i])throw invalid();
 return {bytes:totalBytes,dataBytes:totalBytes-44,durationSeconds:(totalBytes-44)/32000,sampleRate:16000,channels:1,bitsPerSample:16};
}
