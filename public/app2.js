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
let myPeerId = null;
let otherPeerIds = [];
let localStream = null;
let remoteStreams = {};
let myPeer = null;

function init() {
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

async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia(
      {video: true, audio: false});
  localStream = stream;
  document.querySelector('#localVideo').srcObject = localStream;
  console.log('Stream:', document.querySelector('#localVideo').srcObject);
  document.querySelector('#createBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = false;
}

async function createRoom() {
  document.querySelector('#createBtn').disabled = true;
  const db = firebase.firestore();
  const roomRef = await db.collection('rooms').add({});
  const roomId = roomRef.id;
  const roomLink = `${location.origin}/${roomId}`
  document.querySelector('#currentRoom').innerText = `Current room is ${roomId} - You are the caller!`
  document.querySelector('#currentRoomLink').innerHTML = `<a href=${roomLink} target="_blank">${roomLink}</a>`;

  joinRoomById(roomId);
}

async function joinRoomById(roomId){
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();

  myPeer = new Peer({config: configuration});

  myPeer.on('open', function(id) {
    myPeerId = id;
    console.log('My peer ID is: ' + id);
    const peersList = roomRef.collection("peers");
    peersList.add({id: myPeerId});

    // Listen for remote peers
    roomRef.collection("peers").onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          console.log(change.doc.data());
          let otherPeer = change.doc.data();
            if (change.type === "added" && otherPeer.id != myPeerId) {
              otherPeerIds.push(otherPeer.id);

              let call = myPeer.call(otherPeer.id,  localStream);
              myPeer.on('call', function(call2) {
                console.log(call2);
                call2.answer(localStream);
                call2.on('stream', function(stream) {
                  console.log(stream);
                  remoteStreams[otherPeer.id] = stream;
                  renderRemoteStreams(remoteStreams);
                });
              });
              call.on('stream', function(stream) {
                console.log(stream);
                remoteStreams[otherPeer.id] = stream;
                renderRemoteStreams(remoteStreams);
              });
            }
        });
    })
  });

}

function renderRemoteStreams(remoteStreams){
  let tags = [];
  for(const otherPeerId in remoteStreams){
    tags.push(`<video autoplay playsinline id="a${otherPeerId}"></video>`)
  }
  document.querySelector('#remoteVideo').innerHTML = tags;
  setTimeout(function(){
    for(const otherPeerId in remoteStreams){
      document.querySelector(`#a${otherPeerId}`).srcObject = remoteStreams[otherPeerId];
    }
  })
}

init();
