import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const suffix = `${process.pid}-${Date.now()}`,
    network = `socket-mail-${suffix}`,
    relay = `${network}-relay`,
    client = `${network}-client`;
const appImage = process.env.APP_IMAGE ?? 'socket-help:local';
const docker = (...args) =>
    execFileSync('docker', args, {
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
const sink = `const net=require('node:net'),fs=require('node:fs');net.createServer(socket=>{socket.write('220 capture ESMTP\\r\\n');let buffer='',data=false,mail='';socket.on('data',chunk=>{buffer+=chunk;for(;;){const end=buffer.indexOf('\\r\\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(data){if(line==='.') {fs.writeFileSync('/tmp/message',mail);data=false;socket.write('250 stored\\r\\n');}else mail+=line+'\\r\\n';continue;}if(/^EHLO|HELO/i.test(line))socket.write('250 capture\\r\\n');else if(/^DATA/i.test(line)){data=true;mail='';socket.write('354 send message\\r\\n');}else if(/^QUIT/i.test(line)){socket.end('221 bye\\r\\n');}else socket.write('250 ok\\r\\n');}});}).listen(2526,'0.0.0.0');`;
const sender = (from) =>
    `const mail=require('/app/backend/node_modules/nodemailer');mail.createTransport({host:'10.234.0.2',port:587,secure:false,ignoreTLS:true,connectionTimeout:3000,socketTimeout:5000}).sendMail({from:${JSON.stringify(from)},to:'receiver@example.net',subject:'Private relay test',text:'Synthetic relay fixture.',envelope:{from:${JSON.stringify(from)},to:['receiver@example.net']}}).then(()=>console.log('accepted')).catch(()=>{console.log('rejected');process.exitCode=2;});`;
async function until(work) {
    for (let attempt = 0; attempt < 30; attempt++) {
        try {
            const value = work();
            if (value) return value;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Mail relay did not become ready.');
}
try {
    docker('network', 'create', '--internal', '--subnet', '10.234.0.0/24', network);
    docker(
        'run',
        '-d',
        '--name',
        client,
        '--network',
        network,
        '--ip',
        '10.234.0.3',
        '--entrypoint',
        'node',
        appImage,
        '-e',
        sink,
    );
    docker(
        'run',
        '-d',
        '--name',
        relay,
        '--network',
        network,
        '--ip',
        '10.234.0.2',
        '-e',
        'APP_MAIL_ADDRESS=10.234.0.3',
        'socket-help-mail:local',
    );
    await until(() => docker('exec', relay, 'nc', '-z', '127.0.0.1', '587') === '');
    docker(
        'exec',
        relay,
        'postconf',
        '-e',
        'relayhost=[10.234.0.3]:2526',
        'smtp_tls_security_level=none',
    );
    docker('exec', relay, 'postfix', 'reload');
    assert.equal(docker('exec', client, 'node', '-e', sender('agent@socketspace.xyz')), 'accepted');
    const message = await until(() => docker('exec', client, 'cat', '/tmp/message'));
    assert.match(message, /DKIM-Signature:/i);
    assert.match(message, /d=socketspace.xyz/i);
    assert.match(message, /s=socket/i);
    assert.match(message, /Synthetic relay fixture/);
    assert.throws(() => docker('exec', client, 'node', '-e', sender('account@socket.help')));
    assert.throws(() =>
        docker(
            'run',
            '--rm',
            '--network',
            network,
            '--ip',
            '10.234.0.4',
            '--entrypoint',
            'node',
            appImage,
            '-e',
            sender('agent@socketspace.xyz'),
        ),
    );
    const queue = docker('exec', relay, 'postqueue', '-p');
    assert.match(queue, /queue is empty/i);
    console.log(
        'Private relay passed: trusted app delivery, DKIM signing, sender-domain restriction, untrusted-client rejection and queue drain. No mail left the isolated Docker network.',
    );
} catch (error) {
    try {
        console.error(docker('logs', '--tail', '35', relay));
    } catch {}
    throw error;
} finally {
    for (const container of [relay, client])
        try {
            docker('rm', '-f', container);
        } catch {}
    try {
        docker('network', 'rm', network);
    } catch {}
}
