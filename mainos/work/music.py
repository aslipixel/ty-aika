import numpy as np,wave
sr=44100;N=sr*20;t=np.arange(N)/sr;out=np.zeros(N);B=.5
def env(n,a,d):x=np.arange(n)/sr;return np.minimum(1,x/a)*np.exp(-x/d)
def add(sig,at,g=1):
    i=int(at*sr);s=sig[:N-i];out[i:i+len(s)]+=s*g
n=lambda m:440*2**((m-69)/12)
kick=lambda:np.sin(2*np.pi*np.cumsum(50+120*np.exp(-np.arange(sr//3)/sr/.04))/sr)*env(sr//3,.002,.12)
rng=np.random.default_rng(1)
hat=lambda:rng.standard_normal(sr//12)*env(sr//12,.001,.02)
prog=[57,53,48,55]  # Am F C G roots (bar=2s)
chords=[[69,72,76],[65,69,72],[64,67,72],[62,67,71]]
for k in range(40):
    bt=k*B
    if bt<18: add(kick(),bt,.9 if bt>=1 else .5)
    if bt<18: add(hat(),bt+B/2,.12)
for bar in range(10):
    r=prog[bar%4];a=bar*2
    for s in range(8):
        x=np.arange(int(sr*.24))/sr;f=n(r-12)
        add((np.sign(np.sin(2*np.pi*f*x))*.3+np.sin(2*np.pi*f*x))*env(len(x),.005,.12),a+s*.25,.18)
    x=np.arange(sr*2)/sr;pad=sum(np.sin(2*np.pi*n(m)*x)+.3*np.sin(4*np.pi*n(m)*x) for m in chords[bar%4])
    add(pad*np.minimum(1,x/.3)*np.minimum(1,(2-x)/.3),a,.035)
    for s,m in enumerate([0,2,1,2]):
        x=np.arange(int(sr*.4))/sr;add(np.sin(2*np.pi*n(chords[bar%4][m]+12)*x)*env(len(x),.003,.15),a+s*.5+.25,.05)
for c in [3,6,9,12,15,18]:
    x=np.arange(int(sr*.5))/sr;w=rng.standard_normal(len(x));w=np.convolve(w,np.ones(30)/30,'same')
    add(w*np.minimum(1,x/.35)*(x<.5)*.6,c-.5,.25)
x=np.arange(sr*2)/sr;add(sum(np.sin(2*np.pi*n(m)*x) for m in [45,57,64,69])*np.exp(-x/.8),18,.12)
out*=np.minimum(1,(20-t)/1.0)
out=np.tanh(out*1.4)/np.tanh(1.4)*.85
d=(np.repeat(out[:,None],2,1)*32767).astype('<i2')
w=wave.open('music.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes(d.tobytes());w.close()
