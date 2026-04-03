export class NodelyUploadParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name !== "NodelyUpload:Observed") {
      return;
    }

    const browser = this.browsingContext?.top?.embedderElement;
    const ownerGlobal = browser?.ownerGlobal;
    const CustomEventCtor = ownerGlobal?.CustomEvent ?? CustomEvent;

    if (!browser || !ownerGlobal || !CustomEventCtor) {
      return;
    }

    ownerGlobal.dispatchEvent(
      new CustomEventCtor("nodely-upload-observed", {
        detail: {
          browser,
          ...message.data
        }
      })
    );
  }
}
