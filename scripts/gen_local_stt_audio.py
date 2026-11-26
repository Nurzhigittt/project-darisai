import asyncio
import edge_tts
async def main():
    clips=[('en','en-US-AvaNeural','When the pipe narrows, the flow speed increases.'),('ru','ru-RU-SvetlanaNeural','Когда труба сужается, скорость потока увеличивается.'),('kk','kk-KZ-AigulNeural','Құбыр тарылғанда, ағын жылдамдығы артады.')]
    for lang,voice,text in clips:
        await edge_tts.Communicate(text,voice).save(f'artifacts/evals/local/audio/{lang}.mp3')
        print(lang, 'saved')
asyncio.run(main())
