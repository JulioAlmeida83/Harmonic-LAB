import os, wave, struct, math
base = r"samples/bank"

def read_wav(path):
    with wave.open(path, 'rb') as w:
        ch, sw, fr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise RuntimeError('only 16-bit wav supported')
    data = struct.unpack('<%dh' % (n*ch), raw)
    if ch == 1:
        mono = [x/32768.0 for x in data]
    else:
        mono = [ (data[i*ch] + data[i*ch+1]) / (2*32768.0) for i in range(n) ]
    return mono, fr

def write_wav(path, mono, fr):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    vals = []
    for x in mono:
        x = max(-1.0, min(1.0, x))
        v = int(x*32767)
        vals.extend([v, v])
    raw = struct.pack('<%dh' % len(vals), *vals)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(fr)
        w.writeframes(raw)

def one_pole_lowpass(sig, sr, cutoff):
    a = math.exp(-2*math.pi*cutoff/sr)
    y = 0.0
    out = []
    for x in sig:
        y = (1-a)*x + a*y
        out.append(y)
    return out

def highpass_from_low(sig, sr, cutoff):
    low = one_pole_lowpass(sig, sr, cutoff)
    return [x-l for x,l in zip(sig, low)]

def normalize(sig, target=0.92):
    peak = max(1e-9, max(abs(x) for x in sig))
    g = target/peak
    return [x*g for x in sig]

def rhodesify(sig, sr):
    hp = highpass_from_low(sig, sr, 180)
    lp = one_pole_lowpass(hp, sr, 2400)
    out = []
    for i, x in enumerate(lp):
        t = i/sr
        trem = 0.92 + 0.08*math.sin(2*math.pi*5.2*t)
        env = 1.0 - 0.18*min(1.0, t/0.08)
        out.append(x * trem * env)
    return normalize(out, 0.88)

def celloify(sig, sr):
    lp1 = one_pole_lowpass(sig, sr, 1500)
    lp2 = one_pole_lowpass(lp1, sr, 900)
    out = []
    atk = 0.08
    for i, x in enumerate(lp2):
        t = i/sr
        bow = min(1.0, t/atk)
        vib = 1.0 + 0.02*math.sin(2*math.pi*5.1*t)
        body = x*1.25 + lp1[i]*0.35
        out.append(body * bow * vib)
    return normalize(out, 0.9)

piano = os.path.join(base, 'piano')
rhodes = os.path.join(base, 'rhodes')
cello = os.path.join(base, 'cello')

files = sorted(f for f in os.listdir(piano) if f.endswith('.wav'))
for f in files:
    src = os.path.join(piano, f)
    sig, sr = read_wav(src)
    write_wav(os.path.join(rhodes, f), rhodesify(sig, sr), sr)
    write_wav(os.path.join(cello, f), celloify(sig, sr), sr)

print('ok', len(files), 'files transformed')
