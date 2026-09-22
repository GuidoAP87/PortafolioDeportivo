#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
backup_wasabi.py - BACKUP DE EMERGENCIA de los ORIGINALES de nacholingua.com (Wasabi)

Descarga TODO el bucket a una carpeta de esta PC. Es reanudable: si se corta
(luz, WiFi, Ctrl+C), volve a correrlo y saltea lo que ya bajo completo.
Cada archivo se verifica por tamano antes de darlo por bueno.

Uso (terminal de VS Code, con el venv del proyecto activado):
    python backup_wasabi.py

Te pide las credenciales: copialas de Railway -> PortafolioDeportivo -> Variables
(WASABI_ACCESS_KEY y WASABI_SECRET_KEY). No las pegues en ningun chat.

IMPORTANTE: por defecto guarda FUERA del repo (en tu carpeta de usuario).
Nunca pongas el backup dentro de PortafolioDeportivo: el repo es publico.
"""
import os
import sys
import csv
import time
import shutil
import getpass
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

try:
    import boto3
    from boto3.s3.transfer import TransferConfig
    from botocore.config import Config
    from botocore.exceptions import ClientError, EndpointConnectionError
except ImportError:
    print('Falta boto3. Activa el venv del proyecto, o instala con:  pip install boto3')
    sys.exit(1)

DEF_BUCKET    = 'nacho-lingua-fotos'
DEF_ENDPOINT  = 'https://s3.wasabisys.com'
DEF_REGION    = 'us-east-1'
DEF_DESTINO   = Path.home() / 'Backup_Wasabi_NachoLingua'
HILOS         = 4
INTENTOS      = 3
INVALIDOS_WIN = '<>:"|?*\\'


def pedir(nombre_env, texto, defecto=None, secreto=False):
    """Toma el valor de una variable de entorno si existe; si no, lo pregunta."""
    v = os.environ.get(nombre_env, '').strip()
    if v:
        return v
    sufijo = f' [{defecto}]' if defecto else ''
    try:
        if secreto:
            v = getpass.getpass(f'{texto}{sufijo} (no se ve al pegar, es normal): ').strip()
        else:
            v = input(f'{texto}{sufijo}: ').strip()
    except EOFError:
        v = ''
        print()
    return v or (defecto or '')


def ruta_local(base, key):
    """Convierte la key del bucket en una ruta valida para Windows."""
    partes = []
    for p in key.split('/'):
        if p in ('', '.', '..'):
            continue
        p = ''.join('_' if (c in INVALIDOS_WIN or ord(c) < 32) else c for c in p)
        p = p.rstrip(' .') or '_'
        partes.append(p)
    return base.joinpath(*partes) if partes else base / '_sin_nombre'


def ya_esta(obj, base):
    p = ruta_local(base, obj['key'])
    try:
        return p.is_file() and p.stat().st_size == obj['size']
    except OSError:
        return False


def fmt(n):
    n = float(n)
    for u in ('B', 'KB', 'MB', 'GB'):
        if n < 1024:
            return f'{n:.0f} {u}' if u == 'B' else f'{n:.1f} {u}'
        n /= 1024
    return f'{n:.2f} TB'


def explicar_error(codigo, mensaje):
    print(f'\nERROR de Wasabi: {codigo} - {mensaje}\n')
    if codigo in ('InvalidAccessKeyId', 'SignatureDoesNotMatch'):
        print('-> Las credenciales no coinciden. Revisa que copiaste bien ACCESS y SECRET')
        print('   desde Railway (completas, sin espacios al principio o al final).')
    elif codigo in ('AccessDenied', 'AllAccessDisabled', 'AccountProblem', 'Forbidden', '403'):
        print('-> Wasabi BLOQUEO el acceso: casi seguro la cuenta ya esta inactiva.')
        print('   No se puede bajar nada hasta reactivarla. Contacta a Wasabi YA')
        print('   y cuando reactiven, volve a correr este script.')
    elif codigo == 'NoSuchBucket':
        print('-> Ese bucket no existe en esta cuenta. Revisa el valor de WASABI_BUCKET')
        print('   en Railway: puede que los originales esten en OTRA cuenta de Wasabi.')
    elif codigo in ('PermanentRedirect', 'AuthorizationHeaderMalformed', 'IllegalLocationConstraintException'):
        print('-> El bucket esta en otra region. Usa el WASABI_ENDPOINT exacto de Railway')
        print('   (por ejemplo https://s3.us-east-2.wasabisys.com).')


def bajar(client, bucket, obj, base, tcfg):
    destino = ruta_local(base, obj['key'])
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_name(destino.name + '.parcial')
    ultimo = ''
    for intento in range(1, INTENTOS + 1):
        try:
            client.download_file(bucket, obj['key'], str(tmp), Config=tcfg)
            real = tmp.stat().st_size
            if real != obj['size']:
                raise IOError(f'tamano distinto ({real} vs {obj["size"]} bytes)')
            os.replace(tmp, destino)
            return True, ''
        except Exception as e:
            ultimo = f'{type(e).__name__}: {e}'
            try:
                tmp.unlink()
            except Exception:
                pass
            if intento < INTENTOS:
                time.sleep(2 * intento)
    return False, ultimo


def main():
    print('=' * 64)
    print(' BACKUP DE EMERGENCIA - originales de nacholingua.com (Wasabi)')
    print('=' * 64)
    print('Credenciales: Railway -> PortafolioDeportivo -> Variables.')
    print('Enter = usar el valor entre corchetes.\n')

    access   = pedir('WASABI_ACCESS_KEY', 'WASABI_ACCESS_KEY')
    secret   = pedir('WASABI_SECRET_KEY', 'WASABI_SECRET_KEY', secreto=True)
    bucket   = pedir('WASABI_BUCKET',     'WASABI_BUCKET   (Enter si no existe en Railway)', DEF_BUCKET)
    endpoint = pedir('WASABI_ENDPOINT',   'WASABI_ENDPOINT (Enter si no existe en Railway)', DEF_ENDPOINT)
    region   = pedir('WASABI_REGION',     'WASABI_REGION   (Enter si no existe en Railway)', DEF_REGION)
    destino  = Path(pedir('BACKUP_DIR',   'Carpeta destino', str(DEF_DESTINO))).expanduser()

    if not access or not secret:
        print('\nFaltan las credenciales. Cancelado.')
        return 1

    client = boto3.client(
        's3',
        endpoint_url=endpoint,
        aws_access_key_id=access,
        aws_secret_access_key=secret,
        region_name=region,
        config=Config(
            signature_version='s3v4',
            s3={'addressing_style': 'path'},
            connect_timeout=15,
            read_timeout=120,
            retries={'max_attempts': 3, 'mode': 'standard'},
            max_pool_connections=HILOS * 2,
        ),
    )
    tcfg = TransferConfig(use_threads=False)

    # ── 1) Listar todo el bucket ─────────────────────────────────────────
    print(f'\nListando el bucket "{bucket}"...')
    objetos = []
    try:
        for pagina in client.get_paginator('list_objects_v2').paginate(Bucket=bucket):
            for o in pagina.get('Contents', []) or []:
                if o['Key'].endswith('/') and o['Size'] == 0:
                    continue  # "carpetas" vacias
                objetos.append({'key': o['Key'], 'size': o['Size'],
                                'etag': (o.get('ETag') or '').strip('"')})
    except ClientError as e:
        err = e.response.get('Error', {})
        explicar_error(str(err.get('Code', '')), err.get('Message', ''))
        return 2
    except EndpointConnectionError as e:
        print(f'\nNo se pudo conectar a {endpoint}: {e}')
        print('-> Revisa tu conexion a internet y el WASABI_ENDPOINT.')
        return 2

    total_bytes = sum(o['size'] for o in objetos)
    print(f'Encontrados: {len(objetos)} archivos ({fmt(total_bytes)})')
    if not objetos:
        print('El bucket esta vacio: no hay nada para bajar.')
        return 0

    base = destino / bucket
    base.mkdir(parents=True, exist_ok=True)
    pendientes  = [o for o in objetos if not ya_esta(o, base)]
    falta_bytes = sum(o['size'] for o in pendientes)
    libre       = shutil.disk_usage(base).free
    print(f'Ya bajados antes: {len(objetos) - len(pendientes)}  |  '
          f'Por bajar: {len(pendientes)} ({fmt(falta_bytes)})')
    print(f'Destino: {base}')
    print(f'Espacio libre en ese disco: {fmt(libre)}')
    if falta_bytes > libre * 0.95:
        print('\nNO HAY ESPACIO SUFICIENTE. Libera espacio o elegi otra carpeta destino')
        print('(otro disco, un pendrive o un disco externo).')
        return 3

    # ── 2) Descargar en paralelo ─────────────────────────────────────────
    errores = []
    if pendientes:
        print('\nDescargando... (podes cortar con Ctrl+C y retomar despues)\n')
        hechos = ok = 0
        bytes_ok = 0
        t0 = time.time()
        pool = ThreadPoolExecutor(max_workers=HILOS)
        futuros = {}
        try:
            futuros = {pool.submit(bajar, client, bucket, o, base, tcfg): o for o in pendientes}
            for fut in as_completed(futuros):
                o = futuros[fut]
                exito, err = fut.result()
                hechos += 1
                if exito:
                    ok += 1
                    bytes_ok += o['size']
                else:
                    errores.append((o['key'], err))
                    print(f'\n  [ERROR] {o["key"]} -> {err}')
                vel = bytes_ok / max(time.time() - t0, 0.001)
                resto = (falta_bytes - bytes_ok) / vel if vel > 0 else 0
                print(f'\r  {hechos}/{len(pendientes)} archivos  |  {fmt(bytes_ok)} de {fmt(falta_bytes)}'
                      f'  |  {fmt(vel)}/s  |  faltan ~{int(resto // 60)} min     ', end='', flush=True)
        except KeyboardInterrupt:
            # cancel_futures=True recien existe en Python 3.9 y el venv es 3.8:
            # se cancelan a mano las descargas que todavia no empezaron.
            for f in futuros:
                f.cancel()
            pool.shutdown(wait=False)
            print('\n\nCortado a mano. Volve a correr el script: sigue desde donde quedo.')
            return 130
        pool.shutdown(wait=True)

    # ── 3) Verificacion final + manifiesto ───────────────────────────────
    fallidos = {k for k, _ in errores}
    manifiesto = destino / f'manifiesto_{bucket}.csv'
    with open(manifiesto, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['key', 'tamano_bytes', 'etag', 'archivo_local', 'estado'])
        for o in objetos:
            estado = 'OK' if ya_esta(o, base) else ('ERROR' if o['key'] in fallidos else 'FALTA')
            w.writerow([o['key'], o['size'], o['etag'], str(ruta_local(base, o['key'])), estado])

    completos = sum(1 for o in objetos if ya_esta(o, base))
    print('\n\n' + '=' * 64)
    print(f' RESULTADO: {completos} de {len(objetos)} archivos verificados en:')
    print(f'   {base}')
    if completos == len(objetos):
        print(' BACKUP COMPLETO. Los originales estan a salvo en esta PC.')
        print(' Siguiente paso recomendado: copiar esa carpeta a un disco externo.')
    else:
        print(f' Faltan {len(objetos) - completos}. Volve a correr el script para reintentarlos.')
        if errores:
            log = destino / 'errores_backup.txt'
            with open(log, 'w', encoding='utf-8') as f:
                for k, e in errores:
                    f.write(f'{k}\t{e}\n')
            print(f' Detalle de errores: {log}')
    print(f' Manifiesto (lista completa de archivos): {manifiesto}')
    print('=' * 64)
    return 0 if completos == len(objetos) else 4


if __name__ == '__main__':
    sys.exit(main())