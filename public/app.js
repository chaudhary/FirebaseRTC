mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));

// DEfault configuration - Change these if you have a different STUN or TURN server.
const configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomId = null;

function init() {
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#createBtn').addEventListener('click', createRoom);
  openUserMedia();
  let pathname = location.pathname;
  pathname = pathname.replace("/","")
  if(pathname != ""){
    setTimeout(function(){
      joinRoomById(pathname);
    }, 100);
  }
}

async function createRoom() {
  document.querySelector('#createBtn').disabled = true;
  const db = firebase.firestore();

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);

  registerPeerConnectionListeners();

  // Add code for creating a room here

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Code for creating a room below
  const offer = await peerConnection.createOffer();

  const roomWithOffer = {
      offer: {
          type: offer.type,
          sdp: offer.sdp
      }
  }
  const roomRef = await db.collection('rooms').add(roomWithOffer);
  const roomId = roomRef.id;
  const roomLink = `${location.origin}/${roomId}`
  document.querySelector('#currentRoom').innerText = `Current room is ${roomId} - You are the caller!`
  document.querySelector('#currentRoomLink').innerHTML = `<a href=${roomLink} target="_blank">${roomLink}</a>`;

  // Code for creating a room above

  // Code for collecting ICE candidates below
  const candidatesCollection = roomRef.collection("caller");

  peerConnection.addEventListener('icecandidate', event => {
    console.log(event);
      if (event.candidate) {
          const json = event.candidate.toJSON();
          candidatesCollection.add(json);
      }
  });

  await peerConnection.setLocalDescription(offer);

  // Code for collecting ICE candidates above

  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      remoteStream.addTrack(track);
    });
  });

  // Listening for remote session description below
  roomRef.onSnapshot(async snapshot => {
      console.log('Got updated room:', snapshot.data());
      const data = snapshot.data();
      if (!peerConnection.currentRemoteDescription && data.answer) {
          console.log('Set remote description: ', data.answer);
          const answer = new RTCSessionDescription(data.answer)
          await peerConnection.setRemoteDescription(answer);
      }
  });

  // Listening for remote session description above

  // Listen for remote ICE candidates below
  roomRef.collection("callee").onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
          if (change.type === "added") {
              const candidate = new RTCIceCandidate(change.doc.data());
              peerConnection.addIceCandidate(candidate);
          }
      });
  })

  // Listen for remote ICE candidates above
}

async function joinRoomById(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);

  if (roomSnapshot.exists) {
    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Code for collecting ICE candidates below
    const candidatesCollection = roomRef.collection("callee");

    peerConnection.addEventListener('icecandidate', event => {
      console.log(event);
        if (event.candidate) {
            const json = event.candidate.toJSON();
            candidatesCollection.add(json);
        }
    });

    // Code for collecting ICE candidates above

    peerConnection.addEventListener('track', event => {
      console.log('Got remote track:', event.streams[0]);
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        remoteStream.addTrack(track);
      });
    });

    // Code for creating SDP answer below
    const offer = roomSnapshot.data().offer;
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
        answer: {
            type: answer.type,
            sdp: answer.sdp
        }
    }
    await roomRef.update(roomWithAnswer);

    // Code for creating SDP answer above

    // Listening for remote ICE candidates below
    roomRef.collection("caller").onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                const candidate = new RTCIceCandidate(change.doc.data());
                peerConnection.addIceCandidate(candidate);
            }
        });
    })

    // Listening for remote ICE candidates above
  }
}

async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia(
      {video: true, audio: true});
  document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;

  console.log('Stream:', document.querySelector('#localVideo').srcObject);
  document.querySelector('#createBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = false;
}

async function hangUp(e) {
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#currentRoom').innerText = '';

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection('calleeCandidates').get();
    calleeCandidates.forEach(async candidate => {
      await candidate.delete();
    });
    const callerCandidates = await roomRef.collection('callerCandidates').get();
    callerCandidates.forEach(async candidate => {
      await candidate.delete();
    });
    await roomRef.delete();
  }

  document.location.reload(true);
}

async function collectIceCandidates(roomRef, peerConnection, localName, remoteName) {
    const candidatesCollection = roomRef.collection(localName);

    peerConnection.addEventListener('icecandidate', event => {
        if (event.candidate) {
            const json = event.candidate.toJSON();
            candidatesCollection.add(json);
        }
    });

    roomRef.collection(remoteName).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                const candidate = new RTCIceCandidate(change.doc.data());
                peerConnection.addIceCandidate(candidate);
            }
        });
    })
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
        `ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}

init();
