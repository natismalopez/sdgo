# -*- coding: utf-8 -*-
"""Armado del entorno de prueba: inyecta un mock de la API de Apps Script
en el index.html real, para probar la app completa sin internet ni backend."""
import json, io, os

BOLETA_OK="2024630001"; GRUPO_OK="3IM2"
BOLETA_MAL="2025090123"

def datos():
    nombres=["Introducción a C","Variables","Operadores","Control","Ciclos","Funciones"]
    fichas={"lp":{}}
    for t in range(6):
        fichas["lp"][str(t)]={"pdf_url":"","bloques":[
            {"tipo":"def","campo1":f"Concepto {t+1}","campo2":"Definición."},
            {"tipo":"video","campo1":f"Video del tema {t+1}","campo2":"https://youtu.be/dQw4w9WgXcQ","campo3":"Refuerzo en video"},
            {"tipo":"ejercicio","campo1":f"Ejercicio {t+1}","campo2":"#include <stdio.h>\nint main(){ return 0; }","campo3":"(salida)"}]}
    reac={"lp":{str(t):[
        {"p":f"Pregunta A del tema {t+1}","ops":["a","b","c","d"],"c":1,"exp":"exp."},
        {"p":f"Pregunta B del tema {t+1}","ops":["a","b","c","d"],"c":2,"exp":"exp."}] for t in range(6)}}
    MAT=[{"id":"lp","nombre":"Lenguaje de Programación","icono":"💻","color":"#7B1135","unidad":"U1"}]
    TEM={"lp":nombres}
    ALU={"encontrado":True,"boleta":BOLETA_OK,"nombre":"Carlos","apellido_p":"R","apellido_m":"S",
         "grupo":GRUPO_OK,"semestre":"2026-1","turno":"M","email":"c@gmail.com",
         "materiasPadron":["lp"],"materiasSDGo":["lp"],"materiasInscritas":["lp"],"modo":"inscrito"}
    PRO={"progreso":{"lp":{"temas":6,"temasAprobados":{str(i):True for i in range(6)},
         "puntosTema":{str(i):100 for i in range(6)}}},"puntos":600,"puntosPorMateria":{"lp":600},
         "puntosCanjeados":0,"promedios":{"lp":10},"promedioGlobal":10,"logros":[],
         "fechaHoy":"2026-01-01","tiempoHoy":0}
    return fichas,reac,MAT,TEM,ALU,PRO

def build(index_path, out_path):
    html=io.open(index_path,encoding="utf-8").read()
    fichas,reac,MAT,TEM,ALU,PRO=datos()
    mock=f"""<script id="test-mock">(function(){{
 window.__POSTS=[];
 var F={json.dumps(fichas,ensure_ascii=False)},R={json.dumps(reac,ensure_ascii=False)},
     MAT={json.dumps(MAT,ensure_ascii=False)},TEM={json.dumps(TEM,ensure_ascii=False)},
     ALU={json.dumps(ALU,ensure_ascii=False)},PRO={json.dumps(PRO,ensure_ascii=False)};
 var _f=window.fetch.bind(window);
 function J(o){{return Promise.resolve(new Response(JSON.stringify(o),{{status:200,headers:{{'Content-Type':'application/json'}}}}));}}
 window.fetch=function(u,o){{u=String(u||'');
   if(u.indexOf('script.google.com')>=0){{
     if(o&&o.method==='POST'){{ try{{window.__POSTS.push(JSON.parse(o.body));}}catch(e){{window.__POSTS.push({{raw:String(o.body)}});}} return J({{ok:true,data:{{guardado:true}}}}); }}
     if(u.indexOf('accion=alumno')>=0){{
       var b=(u.match(/boleta=([0-9]+)/)||[])[1];
       if(b==='{BOLETA_OK}') return J({{ok:true,data:ALU}});
       return J({{ok:true,data:{{encontrado:false,modo:'libre'}}}});
     }}
     if(u.indexOf('accion=progreso')>=0)return J({{ok:true,data:PRO}});
     return J({{ok:true,data:{{materias:MAT,temas:TEM,numPreguntas:{{}},reactivos:R,fichas:F,asesorias:[],recompensas:[],configuracion:{{}},fechasApertura:(window.__FECHAS||{{}}),modosDesbloqueo:(window.__MODOS||{{}}),fechaServidor:(window.__HOY||'')}}}});
   }}
   return _f(u,o);
 }};
 try{{if(navigator.serviceWorker)navigator.serviceWorker.register=function(){{return Promise.reject('test');}};}}catch(e){{}}
}})();</script>"""
    marca='<div id="toast"></div>'
    assert marca in html, "ancla de inyección no encontrada"
    html=html.replace(marca, marca+"\n"+mock, 1)
    io.open(out_path,"w",encoding="utf-8").write(html)
    return out_path
