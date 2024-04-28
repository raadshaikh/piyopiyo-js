(() => {
    let drums = [];
	let piyoWaveSampleRate = 11025; //not sure if they're really different, but this just seems to kinda work i guess
	let piyoDrumSampleRate = 22050;
	
	//utility function to force a number to within an allowed interval
	function clamp(number, min, max) {
		return Math.max(min, Math.min(number, max));
	}
	
	//utility functions for downloading
	const downloadURL = (data, fileName) => {
	  const a = document.createElement('a')
	  a.href = data
	  a.download = fileName
	  document.body.appendChild(a)
	  a.style.display = 'none'
	  a.click()
	  a.remove()
	}

	const downloadBlob = (data, fileName, mimeType) => {
	  const blob = new Blob([data], {
		type: mimeType
	  })
	  const url = window.URL.createObjectURL(blob)
	  downloadURL(url, fileName)
	  setTimeout(() => window.URL.revokeObjectURL(url), 1000)
	}
	
	//utility function to convert byte array to int32-le array
	function bytesToInt32(arr) {
		let out = [];
		for(let i=0; i<arr.length; i+=4) { //if the array's length isn't divisible by 4, fire and brimstone, not my problem
			out.push(arr[i] + arr[i+1]*256 + arr[i+2]*65536 + arr[i+3]*16777216);
		}
		return out; //array of numbers that can be interpreted as int32
	}
		
	//utility functions to read a bunch of data
	function getBytesLE(view, pos, n_bytes, unsigned) {
		out=[];
		for (let i=0; i<n_bytes; i++){
			out.push(unsigned == 'unsigned' ? view.getUint8(pos, true) : view.getInt8(pos, true));
			pos++;
		}
		out = new Int8Array(out);
		return out;
	}
	function get2BytesLE(view, pos, n_samples, unsigned) {
		out=[];
		for (let i=0; i<n_samples; i++){
			out.push(unsigned == 'unsigned' ? view.getUint16(pos, true) : view.getInt16(pos, true));
			pos+=2;
		}
		out = new Int16Array(out);
		return out;
	}
	

    class Song {
        /**
         * @param {ArrayBuffer} data 
         */
        constructor(data) {
            const view = new DataView(data);
            let p = 0;

            // PiyoPiyo-
            this.isPiyo = view.getUint32(p, true); p += 4;
            if ((this.isPiyo).toString(16).slice(-6) != '444d50') { //"PMDx" where 'x' could be anything (wish there was a function to read 3 bytes)
                throw "Invalid magic.";
            }

            this.track1DataStartAddress = view.getUint32(p, true); p += 4;
			
			this.meas = [4, 4]; //I don't think piyopiyo allows for any other type
			
            this.wait = view.getUint32(p, true); p += 4;
			this.waitFudge = 1.1; //why am i having to do this??
            this.start = view.getInt32(p, true); p += 4;
            this.end = view.getInt32(p, true); p += 4;
            this.songLength = view.getInt32(p, true); p += 4; //upper bound on number of steps to play or consider

            this.instruments = [];

            for (let i = 0; i < 3; i++) {
                const baseOctave = view.getUint8(p, true); p++;
                const icon = view.getUint8(p, true); p++;
                const unknown = view.getUint16(p, true); p += 2;
                const envelopeLength = view.getUint32(p, true); p += 4;
                const volume = view.getUint32(p, true); p += 4;
                const unknown2 = view.getUint32(p, true); p += 4;
                const unknown3 = view.getUint32(p, true); p += 4;
				const waveSamples = getBytesLE(view, p, 256, 'signed'); p+=256;
				const envelopeSamples = getBytesLE(view, p, 64, 'signed'); p+=64;
                this.instruments[i] = { baseOctave, icon, envelopeLength, volume, waveSamples, envelopeSamples };
            }
			const drumVolume = view.getUint32(p, true); p+= 4; //0 to 300. 0 is still faintly audible
			this.instruments[3] = {volume:drumVolume, baseOctave:0}; //instruments[3], being the drum track, is qualitatively different from the others. handle it separately when needed
			console.log(this);
			//assert p == track1DataStartAddress at this point
			
            this.tracks = [];
            for (let i = 0; i < 4; i++) {
                const track = [];
                track.length = this.songLength;

                for (let j = 0; j < track.length; j++) {
                    track[j] = { keys:[], pan:0, pos:j };
                    let record = view.getUint32(p, true); p += 4;
					record = record.toString(2).padStart(32, '0');
					let bitfield = record.slice(-24); //24 binary digits of whether or note a note exists at that key (piyopiyo only supports a range of 2 octaves for any track)
					let keys = [];
					for (let key=0; key<bitfield.length; key++) {
						if (bitfield[key] == '1') keys.push(23-key);
					}
					track[j].keys = keys; //keys is an array of the pitch of all the notes at position j. values can be 0-23 (relative to baseOctave). note that in organya, keys.length could only be 1 (no overlapping notes)
					if(i==3){ //some drum keys are actually empty, if those notes exist then delete them
						let key=0;
						while(key<track[j].keys.length){
							if(drumTypeTable[track[j].keys[key]]==-1 || drumTypeTable[track[j].keys[key]]==undefined){ //some drum frequencies are empty
								track[j].keys.splice(key, 1);
							}
							key++;
						}
					}
					let pan = record.slice(0, 8);
					pan = parseInt(pan, 2);
					track[j].pan = (pan==0) ? 4 : pan; //pan of 0 is considered the same as pan of 4, but 4 is more systematic
				}

                this.tracks[i] = track;
            }
			
        }
    }

    const freqTable = [261, 278, 294, 311, 329, 349, 371, 391, 414, 440, 466, 494];
    const panTable = [256, 0, 86, 172, 256, 340, 426, 512]; //piyo has pan values 1 to 7, but '0' is also centred
    const advTable = [1, 1, 2, 2, 4, 8, 16, 32];
    const octTable = [32, 64, 64, 128, 128, 128, 128, 128];
	const drumTypeTable = [0,0,1,1,4,4,-1,-1,2,2,3,3,5,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]; //piyodrums.bin has some of the drums switched around

    class Organya {
        /**
         * @param {ArrayBuffer} data 
         */
        constructor(data) {
			this.isPlaying=false;
            this.song = new Song(data);
            this.MeasxStep=this.song.meas[0]*this.song.meas[1];
            this.node = null;
            this.onUpdate = null;
            this.t = 0;
            this.playPos = 0;
            this.samplesPerTick = 0;
            this.samplesThisTick = 0;
            this.state = [];
			this.d = new Date();
			
			this.startMeas = 0;
            this.mutedTracks = [];
            this.selectedTrack = 0;
			this.selectionStart = 0;
			this.selectionEnd = 0;
			this.editingMode = 0; //0 for pencil mode, 1 for duplicate mode
			this.recordsToPaste = []; //clipboard
			this.archives = [structuredClone(this.song)]; //history for undo/redo
			this.archivesIndex = 0;
			this.isLoop = true;
			this.isLowSpec = false;
			this.isWaveformEditor = false;
			this.isEditingNumbers=-1; //which edit box is active for the numerical stuff in instrument editor? (0,1,2,3,4,5,6)=(volume, length, octave, size, wait, start, end)
            this.flashArrowsIndex = null;
			for (let i = 0; i < 4; i++) {
                this.state[i] = [
				{
                    t: [],
                    keys: [],
                    frequencies: [],
                    octaves: [],
                    pan: [],
                    vol: [],
                    length: [],
                    num_loops: 0,
                    playing: [],
                    looping: [],
                }
				];
            }
        }

        /**
         * @param {Float32Array} leftBuffer 
         * @param {Float32Array} rightBuffer
         */
        synth(leftBuffer, rightBuffer, preview) {
				var bufferStartTime = Date.now()-this.beginTime; //for debugging, but didn't work out. ignore
            for (let sample = 0; sample < leftBuffer.length; sample++) {
                if (this.samplesThisTick == 0) {
					if (preview==false) this.update(); //update works in increments of song wait time, so anything finer than that is probably handled by this synth function
					else {
						if (this.state[this.selectedTrack][0].length[0] <= 0) {
							this.pause();
						}
						else {
							this.state[this.selectedTrack][0].length[0] -= this.song.wait*this.song.waitFudge/1000; //??
						}
					}
				}

                leftBuffer[sample] = 0;
                rightBuffer[sample] = 0;

                for (let i = 0; i < 4; i++) {
					let i_prec=0;
					while (i_prec<this.state[i].length) { //prec stands for position record. a bundle of all the notes at a particular tick. idk why i called it that. the reason organya didn't have this is cuz in piyopiyo each note can last long enough to meld into upcoming ones
						for(let i_note=0; i_note<this.state[i][i_prec].keys.length; i_note++) {
							if (this.state[i][i_prec].playing[i_note]) {
								
								const samples = (i < 3) ? 256 : drumWaveTable[drumTypeTable[this.state[i][i_prec].keys[i_note]]].length;

								this.state[i][i_prec].t[i_note] += (this.state[i][i_prec].frequencies[i_note] / this.sampleRate) * advTable[this.state[i][i_prec].octaves[i_note]];

								if ((this.state[i][i_prec].t[i_note] | 0) >= samples) { // using == instead of >= will hurt your ears
									if (this.state[i][i_prec].looping[i_note] && this.state[i][i_prec].num_loops >= 1) {
										this.state[i][i_prec].t[i_note] %= samples;
										if (this.state[i][i_prec].num_loops >= 1)
											this.state[i][i_prec].num_loops -= 0; //what? what was this for and why does it seem to be unnecessary now?

									} else {
										this.state[i][i_prec].t[i_note] = 0;
										this.state[i][i_prec].playing[i_note] = false;
										continue;
									}
								}

								const t = this.state[i][i_prec].t[i_note] & ~(advTable[this.state[i][i_prec].octaves[i_note]] - 1);
								let pos = t % samples;
								let pos2 = !this.state[i][i_prec].looping[i_note] && t == samples ?
									pos
									: ((this.state[i][i_prec].t[i_note] + advTable[this.state[i][i_prec].octaves[i_note]]) & ~(advTable[this.state[i][i_prec].octaves[i_note]] - 1)) % samples;
								const s1 = i < 3
									? (this.song.instruments[i].waveSamples[pos] / 256) //wave and drum samples go -100 to 100. not sure if it's still appropriate to divide by 256, since idk what organya sample range was
									: ((drumWaveTable[drumTypeTable[this.state[i][i_prec].keys[i_note]]][pos] ) / 256);
								const s2 = i < 3
									? (this.song.instruments[i].waveSamples[pos2] / 256)
									: ((drumWaveTable[drumTypeTable[this.state[i][i_prec].keys[i_note]]][pos2] ) / 256);
								const fract = (this.state[i][i_prec].t[i_note] - pos) / advTable[this.state[i][i_prec].octaves[i_note]];

								// perform linear interpolation
								let s = s1 + (s2 - s1) * fract;

								//envelope volume stuff
								let fractionOfThisNoteCompleted = 1 - (this.state[i][i_prec].length[i_note] - this.samplesThisTick/this.sampleRate)/(this.song.instruments[i].envelopeLength/(piyoWaveSampleRate));
								let volumeEnv=1;
								if (fractionOfThisNoteCompleted>1) {volumeEnv=0;} //in case we're in that little bit of overshoot because of the ticks not lining up with envelope lengths
								else {volumeEnv = (i<3) ? this.song.instruments[i].envelopeSamples[(fractionOfThisNoteCompleted*63 | 0)]/128 : 1-0.4*(this.state[i][i_prec].keys[i_note]%2==1);} //envelope samples go 0-128. also, odd-key drums are softer. the 0.4 factor is eyeballed
								
								s *= Math.pow(10, ((this.state[i][i_prec].vol[i_note] - 256) * 8)/2000);
								//s *= Math.pow(10, 1.2*this.state[i][i_prec].vol[i_note]/300 - 1.45) //my messy calculation that i turned out not to need when i figured out how the envelope works
								s *= volumeEnv; //why didn't i realise this right away i'm so stupid
								
								const pan = (panTable[this.state[i][i_prec].pan[i_note]] - 256) * 10;
								let left = 1, right = 1;

								if (pan < 0) {
									right = Math.pow(10, pan / 2000);
								} else if (pan > 0) {
									left = Math.pow(10, -pan / 2000);
								}

								leftBuffer[sample] += s * left;
								rightBuffer[sample] += s * right;
							}
						}
					i_prec++;
					}
                }

                if (++this.samplesThisTick == this.samplesPerTick) {
                    this.samplesThisTick = 0;
					if(preview==false) {
						this.playPos += 1;
						this.startMeas = (this.playPos/this.MeasxStep | 0);
						this.updateTimeDisplay();
					}

                    if (this.playPos >= this.song.end) {
						if (this.isLoop == true) {
							this.playPos = this.song.start;
							this.updateTimeDisplay();
						}
						else if (this.isLoop == false) {
							this.pause();
						}
                    }
                }
            }
				var bufferEndTime = Date.now()-this.beginTime;
				//console.log(bufferEndTime-bufferStartTime); //amount of time taken to compute the audio data for one buffer-full (~170ms worth of sound)
        }
        
        homeOrg() {
			this.pause();
			this.playPos = 0;
			this.startMeas=0;
            this.updateTimeDisplay();
        }
		endOrg() {
			this.pause();
			this.playPos = this.song.end-this.MeasxStep;
			this.startMeas=(this.playPos/this.MeasxStep | 0);
			this.updateTimeDisplay();
		}
        
        backMeas(small=false) {
            if(!small) {
				if (this.playPos-(this.MeasxStep+this.playPos%this.MeasxStep)>=0){
					this.playPos-=(this.MeasxStep+this.playPos%this.MeasxStep);
				}
				else this.playPos = 0;
			}
			else {
				if (this.playPos-1>=0){
					this.playPos -= 1;
				}
			}
			this.startMeas = Math.min(this.startMeas, (this.playPos/this.MeasxStep | 0));
            this.updateTimeDisplay();
        }
        
        nextMeas(small=false) {
            if(!small) this.playPos+=(this.MeasxStep-this.playPos%this.MeasxStep); //to go to beginning of next measure
			else this.playPos += 1;
			this.startMeas = (this.playPos/this.MeasxStep | 0);
            this.updateTimeDisplay();
        }
		
		cursorUpdate(x) {
			let viewPos = this.startMeas*this.MeasxStep;
			let newPlayPosOffset = ((x-36)/12 | 0); //offset (in beats) from viewpos (the beat # of the beginning of the viewing window)
            this.playPos = viewPos + newPlayPosOffset;
			this.selectionStart = this.playPos;
			this.selectionEnd = this.selectionStart;
            this.updateTimeDisplay(); //would be nice if i can pass an argument here that suppresses the window redraw to match the new measure, since clicking a little further down completely changes your view (we only want to do that while actually playing)
        }
		
		headFootUpdate(x, y, headOrFoot) { //headOrFoot here is 'isDraggingHeadFoot' in the html
			let viewPos = this.startMeas*this.MeasxStep;
			let newPosOffset = ((x-42)/12 | 0);
            if(headOrFoot=='head') this.song.start = Math.max(viewPos + newPosOffset, 0);
            if(headOrFoot=='foot') this.song.end = Math.max(viewPos + newPosOffset, 0);
            if(headOrFoot=='size') {
				let oldLength = this.song.songLength;
				this.song.songLength = Math.max(viewPos + newPosOffset, 0);
				this.extendSong(oldLength, this.song.songLength);
			}
			//this.archivesUpdate---(); //this change happens 'continuously' so don't do the update here, do it on mouseup in the html
            this.updateTimeDisplay();
		}
		
		extendSong(oldLength, newLength) {
			for(let track=0; track<4; track++) {
				for(let j=oldLength; j<newLength; j++) {
					let emptyRecord = {keys:[], pan:4, pos:j};
					this.song.tracks[track].push(emptyRecord);
				}
			}
		}
		
		selectionUpdate(x, fromKeyboard=false) {
			if(fromKeyboard==false) {
				let viewPos = this.startMeas*this.MeasxStep;
				let newSelectionEndOffset = ((x-36)/12 | 0); //offset (in beats) from viewpos (the beat # of the beginning of the viewing window)
				this.selectionEnd = viewPos + newSelectionEndOffset;
			}
			else if(typeof fromKeyboard=='number') {
				this.selectionEnd = this.selectionEnd+fromKeyboard;
			}
			this.selectionEnd = clamp(this.selectionEnd, 0, this.song.songLength);
            this.updateTimeDisplay();
        }
		
		addNote(x, y, scrollY) {
			let viewPos = this.startMeas*this.MeasxStep;
			let newNotePos = viewPos + ((x-36)/12 | 0);
			let newNoteKey = (96 - ((y + scrollY)/12) | 0);
			let newNoteKeyRelative = newNoteKey % 12;
			let newNoteKeyOctave = (newNoteKey / 12 | 0);
			let toPush = newNoteKeyRelative + 12*(newNoteKeyOctave-this.song.instruments[this.selectedTrack].baseOctave);
			var keys = this.song.tracks[this.selectedTrack][newNotePos].keys;
			if(newNoteKeyOctave-this.song.instruments[this.selectedTrack].baseOctave >= 0 && newNoteKeyOctave-this.song.instruments[this.selectedTrack].baseOctave <= 1) { //the if condition here is to restrict the newly added note to the supported two octaves as determined by the instrument's baseOctave
				if (keys.includes(toPush)) keys.splice(keys.indexOf(toPush), 1);
				else if((this.selectedTrack!=3) || (drumTypeTable[newNoteKey]!=-1 && drumTypeTable[newNoteKey]!=undefined)) {
					this.previewNote(y, scrollY);
					keys.push(toPush);
				}
				this.archivesUpdate();
				if (this.onUpdate) this.onUpdate(this);
			}
		}
		
		deleteNotes() {
			for(let i=Math.min(this.selectionStart, this.selectionEnd); i<Math.max(this.selectionStart, this.selectionEnd); i++) {
				this.song.tracks[this.selectedTrack][i].keys=[];
				this.song.tracks[this.selectedTrack][i].pan=0;
			}
			this.archivesUpdate();
			if (this.onUpdate) this.onUpdate(this);
		}
		
		copyNotes() {
			this.recordsToPaste = [];
			let selectionStart = Math.min(this.selectionStart, this.selectionEnd);
			let selectionEnd = Math.max(this.selectionStart, this.selectionEnd);
			for(let i=0; i<selectionEnd-selectionStart; i++) {
				let recordToPaste = {keys:[], pan:0};
				recordToPaste.keys = this.song.tracks[this.selectedTrack][selectionStart+i].keys.slice();
				recordToPaste.pan = this.song.tracks[this.selectedTrack][selectionStart+i].pan;
				this.recordsToPaste.push(recordToPaste);
			}
		}
		pasteNotes(x, y) {
			let viewPos = this.startMeas*this.MeasxStep;
			let newNotePos = viewPos + ((x-36)/12 | 0);
			if(x==-1 && y==-1) newNotePos = this.playPos; //if ctrl+v instead of mouseclick, paste at playPos
			for(let i=0; i<this.recordsToPaste.length; i++) {
				this.song.tracks[this.selectedTrack][newNotePos+i].keys = this.recordsToPaste[i].keys.slice();
				this.song.tracks[this.selectedTrack][newNotePos+i].pan = this.recordsToPaste[i].pan;
			}
			this.archivesUpdate();
			if (this.onUpdate) this.onUpdate(this);
		}
		
		transposeNotes(argument) {
			for(let i=this.selectionStart; i<this.selectionEnd; i++) {
				this.song.tracks[this.selectedTrack][i].keys = this.song.tracks[this.selectedTrack][i].keys.map(a => clamp(a+argument, 0, 23));
			}
			if (this.onUpdate) this.onUpdate(this);
		}
		
		addPan(x, y, height) {
			let viewPos = this.startMeas*this.MeasxStep;
			let newPanPos = viewPos + ((x-36)/12 | 0);
			let newPanVal = ((height-y-76)/12 | 0)+1;
			this.song.tracks[this.selectedTrack][newPanPos].pan = newPanVal;
			this.archivesUpdate();
			if (this.onUpdate) this.onUpdate(this);
		}
		
		changeTrack(x, click) {
			let newSelectedTrack = (x/64 | 0);
			if(click==0) this.selectedTrack = newSelectedTrack;
			else if(click==2) {
				var inputElements = document.getElementsByClassName('mute');
				inputElements[newSelectedTrack].checked=1-inputElements[newSelectedTrack].checked;
			}
			this.update();
		}
        
		changeEditingMode(argument) {
			this.editingMode=argument;
			if (this.onUpdate) this.onUpdate(this);
		};
		
		changeLoop() {
			this.isLoop = 1-this.isLoop;
			if (this.onUpdate) this.onUpdate(this);
		}
		changeLowSpec() {
			this.isLowSpec = 1-this.isLowSpec;
			if (this.onUpdate) this.onUpdate(this);
		}
		
		toggleWaveformEditor() {
			this.pause();
			this.isWaveformEditor = 1-this.isWaveformEditor;
			if(!this.isWaveformEditor) {
				this.isEditingNumbers = -1;
				this.archivesUpdate();
			}
			if (this.onUpdate) this.onUpdate(this);
		}
		
		updateNoteIcon(x, y) {
			x -= 64;
			y -= 274;
			let iconID = (x/12 | 0) + 10*(y/12 | 0);
			this.song.instruments[this.selectedTrack].icon = iconID;
			if (this.onUpdate) this.onUpdate(this);
		}
		
		editWaveSamples(x, y) {
			let newPos = ((x-64)/2 | 0);
			let newSample = 156-y;
			this.song.instruments[this.selectedTrack].waveSamples[newPos] = newSample;
			if (this.onUpdate) this.onUpdate(this);
		}
		editEnvelopeSamples(x, y) {
			let newPos = ((x-320)/4 | 0);
			let newSample = 402-y;
			this.song.instruments[this.selectedTrack].envelopeSamples[newPos] = newSample;
			if (this.onUpdate) this.onUpdate(this);
		}
		editNumbers(newValueInput, fromKeyboard=0) { //this is such a mess ;_;
			if(this.isEditingNumbers!=-1 && newValueInput!==null && newValueInput!=='') {
				const minValues = [1, 40, 0, 16, 20, 0, 0];
				const maxValues = [300, 44100, 5, 4096, 1000, this.song.songLength, this.song.songLength];
				let newValue = Math.max(newValueInput, minValues[this.isEditingNumbers]);
				newValue = clamp(newValueInput, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
				switch (this.isEditingNumbers) {
					case 0:
						this.song.instruments[this.selectedTrack].volume = (fromKeyboard==0) ? newValue : clamp(this.song.instruments[this.selectedTrack].volume + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						break;
					case 1:
						this.song.instruments[this.selectedTrack].envelopeLength = (fromKeyboard==0) ? newValue : clamp(this.song.instruments[this.selectedTrack].envelopeLength + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						break;
					case 2:
						this.song.instruments[this.selectedTrack].baseOctave = (fromKeyboard==0) ? newValue : clamp(this.song.instruments[this.selectedTrack].baseOctave + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						break;
					case 3:
						let oldLength = this.song.songLength;
						this.song.songLength = (fromKeyboard==0) ? newValue : clamp(this.song.songLength + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						this.extendSong(oldLength, this.song.songLength);
						break;
					case 4:
						this.song.wait = (fromKeyboard==0) ? newValue : clamp(this.song.wait + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						break;
					case 5:
						this.song.start = (fromKeyboard==0) ? newValue : clamp(this.song.start + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						break;
					case 6:
						this.song.end = (fromKeyboard==0) ? newValue : clamp(this.song.end + fromKeyboard, minValues[this.isEditingNumbers], maxValues[this.isEditingNumbers]);
						break;
				}
				if (this.onUpdate) this.onUpdate(this);
			}
		}
		
		flashArrows() { //how do I do this? wow okay i figured it out
			if (this.flashArrowsIndex==null) this.flashArrowsIndex=0;
			this.flashArrowsIndex = (this.flashArrowsIndex + 1)%8;
			//console.log(this);
			if (this.onUpdate) this.onUpdate(this);
		}
		
		presetsWave(y) {
			//0,1,2,3 = sine, square, triangle, sawtooth
			let yOff = y-74;
			if(yOff>-1 && yOff<28) {
				for(let i=0; i<256; i++) {
					this.song.instruments[this.selectedTrack].waveSamples[i] = 95.0*Math.sin(i*2*Math.PI/256);
				}
			}
			else if(yOff>44 && yOff<28+44) {
				for(let i=0; i<256; i++) {
					this.song.instruments[this.selectedTrack].waveSamples[i] = 95.0*(i<128 ? 1.0 : -1.0);
				}
			}
			else if(yOff>88 && yOff<28+88) {
				for(let i=0; i<256; i++) {
					let i_ = (i+64)%256;
					this.song.instruments[this.selectedTrack].waveSamples[i] = 0.95*(-1*Math.abs((i_-128)*200/128)+100);
				}
			}
			else if(yOff>132 && yOff<28+132) {
				for(let i=0; i<256; i++) {
					let i_=(i+128)%256;
					this.song.instruments[this.selectedTrack].waveSamples[i] = 0.95*(i_*200/256 - 100);
				}
			}
			if (this.onUpdate) this.onUpdate(this);
		}
		presetsEnve(y) {
			//0,1,2,3,4,5,6,7
			let yOff = y-274;
			let A=13/14;
			if(yOff>=0 && yOff<16) {
				for(let i=0; i<64; i++) {
					let x = i/64;
					let y = A;
					this.song.instruments[this.selectedTrack].envelopeSamples[i] = 128*y;
				}
			}
			else if(yOff>=16 && yOff<16*2) {
				for(let i=0; i<64; i++) {
					let x = i/64;
					let y = A*(1-Math.pow(Math.abs(2*x-1), 7));
					this.song.instruments[this.selectedTrack].envelopeSamples[i] = 128*y;
				}
			}
			else if(yOff>=16*2 && yOff<16*3) {
				for(let i=0; i<64; i++) {
					let x = i/64;
					let y = A*(1-Math.pow(2*x-1, 2));
					this.song.instruments[this.selectedTrack].envelopeSamples[i] = 128*y;
				}
			}
			else if(yOff>=16*3 && yOff<16*4) {
				for(let i=0; i<64; i++) {
					let x = i/64;
					let y = A*(1-x);
					this.song.instruments[this.selectedTrack].envelopeSamples[i] = 128*y;
				}
			}
			else if(yOff>=16*4 && yOff<16*5) {
				for(let i=0; i<64; i++) {
					let x = i/64;
					let y = A*(1-Math.pow(2*x-1, 2))*0.93/(2*x + 0.2);
					this.song.instruments[this.selectedTrack].envelopeSamples[i] = 128*y;
				}
			}
			else if(yOff>=16*5 && yOff<16*6) {
				for(let i=0; i<64; i++) {
					let x = i/64;
					let y = x<0.1 ? 10*x : 1-Math.pow(x-0.1, 0.3);
					this.song.instruments[this.selectedTrack].envelopeSamples[i] = A*128*y;
				}
			}
			else if(yOff>=16*6 && yOff<16*7) { //what a mess i've made of this
				function f1(x){return 10*x;}
				function f2(x){return 0.4+40*Math.pow(x-0.2,2);}
				function f3(x){return 0.2+32*Math.pow(x-0.4,2);}
				function f4(x){return 0.1+36*Math.pow(x-0.6,2);}
				function f5(x){return 2*Math.pow(x-1,2);}
				for(let i=0; i<64; i++) {
					let x = i/64;
					let y = (x<0.1)*f1(x) + (x>=0.1&&x<0.29)*f2(x) + (x>=0.29&&x<0.5)*f3(x) + (x>=0.5&&x<0.66)*f4(x) + (x>=0.66)*f5(x);
					this.song.instruments[this.selectedTrack].envelopeSamples[i] = 128*y;
				}
			}
			else if(yOff>=16*7 && yOff<16*8) {
				function g1(x){return 0.5-50*Math.pow(x-0.1,2);}
				function g2(x){return 1+8*(x-0.23);}
				function g3(x){return 0.8+90*Math.pow(x-0.27,2);}
				function g4(x){return 3.6*Math.pow(x-1,4);}
				for(let i=0; i<64; i++) {
					let x = i/64;
					let y = (x<=0.15)*g1(x) + (x>0.15&&x<=0.23)*g2(x) + (x>0.23&&x<=0.3)*g3(x) + (x>0.3)*g4(x);
					this.song.instruments[this.selectedTrack].envelopeSamples[i] = 128*y;
				}
			}
			if (this.onUpdate) this.onUpdate(this);
		}
		
		undo() {
			if(this.archivesIndex>0) {
				this.archivesIndex--;
				this.song = structuredClone(this.archives[this.archivesIndex]);
				this.update();
			}
		}
		redo() {
			if(this.archivesIndex<this.archives.length-1) {
				this.archivesIndex++;
				this.song = structuredClone(this.archives[this.archivesIndex]);
				this.update();
			}
		}
		archivesUpdate() { //note: actions that should erase archives items after the archivesIndex and then update the archives include:
			this.archives.splice(this.archivesIndex+1, this.archives.length); // place note, delete note, delete notes, paste notes, change pan, press ok on waveform editor window, change loop points
			this.archives.push(structuredClone(this.song));
			this.archivesIndex++;
		}
		
		previewNote(y, scrollY) {
			let newNoteKey = (96 - ((y + scrollY)/12) | 0);
			let newNoteKeyRelative = newNoteKey % 12;
			let newNoteKeyOctave = (newNoteKey / 12 | 0);
			if((this.selectedTrack!=3) || (drumTypeTable[newNoteKey]!=-1 && drumTypeTable[newNoteKey]!=undefined)) {
				if(newNoteKeyOctave-this.song.instruments[this.selectedTrack].baseOctave >= 0 && newNoteKeyOctave-this.song.instruments[this.selectedTrack].baseOctave <= 1) {
					for (let i = 0; i < 4; i++) {
						this.state[i] = [
						{
							t: [],
							keys: [],
							frequencies: [],
							octaves: [],
							pan: [],
							vol: [],
							length: [],
							num_loops: 0,
							playing: [],
							looping: [],
						}
						];
					}
					this.state[this.selectedTrack][0].t.push(0);
					this.state[this.selectedTrack][0].keys.push(this.selectedTrack < 3 ? newNoteKeyRelative : newNoteKey);
					this.state[this.selectedTrack][0].frequencies.push(this.selectedTrack < 3 ? freqTable[newNoteKeyRelative] * octTable[newNoteKeyOctave] : piyoDrumSampleRate);
					this.state[this.selectedTrack][0].octaves.push(newNoteKeyOctave*(this.selectedTrack!=3));
					this.state[this.selectedTrack][0].pan.push(4);
					this.state[this.selectedTrack][0].vol.push(this.song.instruments[this.selectedTrack].volume);
					this.state[this.selectedTrack][0].length.push((this.selectedTrack<3) ? (this.song.instruments[this.selectedTrack].envelopeLength/piyoWaveSampleRate) : drumWaveTable[drumTypeTable[newNoteKey]].length/piyoDrumSampleRate);
					this.state[this.selectedTrack][0].num_loops = (newNoteKeyOctave-this.song.instruments[this.selectedTrack].baseOctave+1)*4;
					this.state[this.selectedTrack][0].playing.push(true);
					this.state[this.selectedTrack][0].looping.push(this.selectedTrack!=3);
					if(!this.isPlaying) this.play('doPlay', true);
				}
			}
		}
		
		saveFile() {
			this.pause();
			let toDownload = [];
			toDownload=[this.song.isPiyo, this.song.track1DataStartAddress, this.song.wait, this.song.start, this.song.end, this.song.songLength];
			
			for (let i = 0; i < 3; i++) {
				let baseOctaveIconUnknown = 0;
				let unknown = 0; //if these turn out to be important we can just save them to the song object during loading and retrieve them here
				let unknown2 = 0;
				let unknown3 = 0;
				baseOctaveIconUnknown += this.song.instruments[i].baseOctave;//
				baseOctaveIconUnknown += 256*this.song.instruments[i].icon;// most stuff is int32-le, but these are smaller, so i'm combining them to write to the file
                baseOctaveIconUnknown += 65536*unknown;//
				toDownload.push(baseOctaveIconUnknown);
                toDownload.push(this.song.instruments[i].envelopeLength);
                toDownload.push(this.song.instruments[i].volume);
                toDownload.push(unknown2);
                toDownload.push(unknown3);
				
				let waveSamplesArray = bytesToInt32(this.song.instruments[i].waveSamples);
				let envelopeSamplesArray = bytesToInt32(this.song.instruments[i].envelopeSamples);
				toDownload = toDownload.concat(waveSamplesArray);
				toDownload = toDownload.concat(envelopeSamplesArray);
            }
            toDownload.push(this.song.instruments[3].volume);
			
			for (let i = 0; i < 4; i++) {
                for (let j = 0; j < this.song.songLength; j++) {
					let keys24 = 0;
					let pan8 = 0;
					let record32 = 0;
					for(let k=0; k<this.song.tracks[i][j].keys.length; k++){
						keys24 += Math.pow(2, this.song.tracks[i][j].keys[k]);
					}
					pan8 = this.song.tracks[i][j].pan;
					record32 += pan8*16777216;
					record32 += keys24;
					toDownload.push(record32);
				}
			}
			
			toDownload = new Int32Array(toDownload);
			downloadBlob(toDownload, new_song_trimmed+'.pmd', 'application/octet-stream');
			
		}
		
		exportMIDI() {
			this.pause();
			let loops = prompt('How many times should the looping section repeat in the exported MIDI?'); 
			if(isNaN(parseInt(loops))) return;
			const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
			const drumNotes = [36, 36, 43, 43, 40, 40, -1, -1, 42, 42, 44, 44, 46, 46]; //matched by ear to GM percussion instruments (midi channel 10). not sure of these though
			var midiTracks=[];
			for(let n_track=0; n_track<4; n_track++){
				const track = new MidiWriter.Track();
				track.setTempo(15000/(this.song.wait*this.song.waitFudge) | 0);
				for(let i_raw=0; i_raw<this.song.start+loops*(this.song.end-this.song.start); i_raw++){
					let i = this.song.start + (i_raw-this.song.start)%(this.song.end-this.song.start);
					let record = this.song.tracks[n_track][i];
					let pitches = [];
					for(let j=0; j<record.keys.length; j++){
						let relativeNote = record.keys[j]%12;
						let totalOctave = (record.keys[j]/12 | 0) + this.song.instruments[n_track].baseOctave;
						let pitch=0;
						if(n_track!=3) pitch = noteNames[relativeNote] + totalOctave;
						if(n_track==3) pitch = drumNotes[12*totalOctave + relativeNote];
						pitches.push(pitch);
					}
					let noteDuration = 'T' + ((128/this.song.meas[1])*(this.song.instruments[n_track].envelopeLength/piyoDrumSampleRate)/(this.song.wait/1000) | 0); //yes, i meant to use drumsamplerate for all instruments here. it works for some reason
					let noteVelocity = (100*this.song.instruments[n_track].volume/300 | 0);
					if(n_track==3) {noteDuration = '4';}
					let startTime = (128/this.song.meas[1])*i_raw | 0;
					const note = new MidiWriter.NoteEvent({pitch: pitches, duration: noteDuration, channel: (n_track!=3) ? n_track+1 : 10, tick:startTime, velocity:noteVelocity});
					track.addEvent(note);
				}
				midiTracks.push(track);
			}
			const write = new MidiWriter.Writer(midiTracks);
			const toDownload = new Int8Array(write.buildFile());
			downloadBlob(toDownload, new_song_trimmed+'.mid', 'audio/midi');
		}
        
        updateTimeDisplay() {
            currentMeasDisplay.innerHTML=this.playPos/(this.MeasxStep) | 0;
            currentStepDisplay.innerHTML=this.playPos%(this.MeasxStep);
            if (this.onUpdate) this.onUpdate(this); //this line is so as to update the display when next/previous is pressed, even when not playing
        }
        
        update() {
            if (this.onUpdate) this.onUpdate(this);
			//console.log(Date.now()-this.beginTime);
            
			if (this.playPos>=this.song.end && this.isLoop) this.playPos=this.song.start;
			
            this.whichMuted();

            for (let track = 0; track < 4; track++) { //melody (non-drum) tracks
                if (!(this.mutedTracks.includes(track))) {
					//const record = this.song.tracks[track].find((n) => n.pos == this.playPos); //why all this hassle? don't we just want the pos-th item in the track? or were empty positions not stored with an empty track item, thus necessitating storing pos info in each track item? i don't think i'm doing that here
					const record = this.song.tracks[track][this.playPos];
					if (record.keys.length != 0) { //only continue if there is some or the other note at that position
						let keys = record.keys;
						this.state[track].push({t: [], keys: [], frequencies: [], octaves: [], pan: [], vol: [], length: [], num_loops: 0, playing: [], looping: [] });
						let lastIndex = this.state[track].length-1;	
						for (let i_note=0; i_note<record.keys.length; i_note++) { //iterate over all the notes in the track at one particular position (this was unnecessary in organya)

								const octave = ((keys[i_note] / 12) | 0)*(track!=3) + this.song.instruments[track].baseOctave;
								const key = keys[i_note] % 12;
								const frequencyToPush = track < 3 ? freqTable[key] * octTable[octave] : piyoDrumSampleRate; //the piyoDrumSampleRate value was pretty much titrated, and now i'm realising like oh okay so frequency's in samples per second, not cycles or radians
								//const frequencyToPush = 8363*Math.pow(2, octave + key/12);
								
								this.state[track][lastIndex].keys.push(track<3 ? key : keys[i_note]); //keeping a 0-24 range for the drums since otherwise the highest drums sounds like the lowest ones
								this.state[track][lastIndex].t.push(0);

								this.state[track][lastIndex].frequencies.push(frequencyToPush);
								if (!this.state[track][lastIndex].playing[i_note]) {
									this.state[track][lastIndex].num_loops = ((octave + 1) * 4); //what does this do?
								}
								
								if (!this.state[track][lastIndex].playing[i_note]) {
									this.state[track][lastIndex].num_loops = ((octave + 1) * 4);
								}

								this.state[track][lastIndex].octaves.push(octave);
								this.state[track][lastIndex].playing.push(true);
								this.state[track][lastIndex].looping.push(track!=3);
								this.state[track][lastIndex].length.push( (track<3) ? (this.song.instruments[track].envelopeLength/piyoWaveSampleRate) : drumWaveTable[drumTypeTable[this.state[track][lastIndex].keys[i_note]]].length/piyoDrumSampleRate); //in seconds. not sure why i'm using different sample rates, but it seems to work?


							if (this.state[track][lastIndex].keys.length >0) {
								this.state[track][lastIndex].vol.push(this.song.instruments[track].volume); //piyopiyo doesn't allow changing volume mid-track, but drums can have different volumes and we don't want those overlapping
								this.state[track][lastIndex].pan.push(record.pan);
							}
						} //ending the 'skip muted tracks' if-block here, rather than at the end, because otherwise, muting while a note played would make that note get stuck
					}
				}
				let i_prec=0;
				while (i_prec<this.state[track].length){
					for(let i_note=0; i_note<this.state[track][i_prec].keys.length; i_note++){
						if (this.state[track][i_prec].length[i_note] <= 0) { //the length of a note isn't necessarily an integer multiple of a tick length in piyo, so this was running into negatives. figure out how to fix this. maybe go to the playback function and use length in terms of seconds instead? yeah that worked out i guess
							this.state[track][i_prec].frequencies.splice(i_note, 1);
							this.state[track][i_prec].keys.splice(i_note, 1);
							this.state[track][i_prec].octaves.splice(i_note, 1);
							this.state[track][i_prec].length.splice(i_note, 1);
							this.state[track][i_prec].t.splice(i_note, 1);
							this.state[track][i_prec].playing.splice(i_note, 1);
							this.state[track][i_prec].looping.splice(i_note, 1);
							this.state[track][i_prec].pan.splice(i_note, 1);
							this.state[track][i_prec].vol.splice(i_note, 1);
						}
						else {
							this.state[track][i_prec].length[i_note] -= 1.6*this.song.wait*this.song.waitFudge/1000; //why am I multiplying this extra number thing here? and the waitfudge too. I have no idea why I'm having to do this. But playback is too slow without it. More like notes are too long without it. What is going on??
						}
					}
					if(this.state[track][i_prec].length.length==0) {this.state[track].splice(i_prec, 1);}
					i_prec++;
				}
            }
        }

        stop() {
			this.isPlaying=false;
			if(this.ctx.state!='closed') {
				this.node.disconnect();
				this.ctx.close();
			}
        }
        
        pause() {
			this.isPlaying=false;
			prev_song = new_song;
			for(let track=0; track<4; track++){
				this.state[track]=[{t: [], keys: [], frequencies: [], octaves: [], pan: [], vol: [], length: [], num_loops: 0, playing: [], looping: []}];
            }//flushing the envelopes out so pressing home and replaying doesn't have a leftover of where you stopped
			this.node.disconnect();
        }

        play(argument, preview=false) {
			if(this.isPlaying==false){
				this.ctx = new (window.AudioContext || window.webkitAudioContext)();
				this.sampleRate = this.ctx.sampleRate;
				this.samplesPerTick = (this.sampleRate / 1000) * this.song.wait*this.song.waitFudge | 0; //??
				this.samplesThisTick = 0;
				this.beginTime = this.d.getTime();
				//console.log(this.beginTime);

				this.node = this.ctx.createScriptProcessor(8192, 0, 2);
				
				if(argument=='doPlay'){ //the point of this bit is to change the display as soon as a new org is selected
					this.isPlaying = true;
					this.node.onaudioprocess = (e) => {this.synth(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1), preview);}
					this.node.connect(this.ctx.destination);
				}
			}
        }
        
        whichMuted() {
            var checkedValues = [];
            var inputElements = document.getElementsByClassName('mute');
            for(var i=0; inputElements[i]; ++i){
                if(inputElements[i].checked){
                    checkedValues.push(Number(inputElements[i].value));
                }
            }
            this.mutedTracks=checkedValues;
        }
    }

    window.initOrganya = async () => {
        if (window.Organya) return;
        
        //splitting waves and drums into separate wavetables
        
        console.log("Initializing PiyoPiyo...");
        
		const drumURL = new URL("https://raadshaikh.github.io/music/piyopiyo-js/piyoDrums.bin");
        const res_d = await fetch(drumURL); //'_d' for 'drum'. Beyond that, code is unchanged
        const buf_d = await res_d.arrayBuffer();
        const view_d = new DataView(buf_d);
        drumWaveTable = new Int16Array(buf_d);
		drumWaveTable = [];
		
		let i = 0;
        while (drums.length < 6) {
			const drumfile_offset = i;
			const wavLen = view_d.getUint32(i, false); i += 4; //wavLen is in bytes. each sample is 2 bytes, though
			drumWaveTable.push(get2BytesLE(view_d, i, wavLen/2, 'unsigned'));
			drums.push({ filePos: drumfile_offset, samples: wavLen/2 });
			i += wavLen;
        }
		for (let i=0; i<6; i++){  //getting it into -100 to 100 range, like melody samples
			for (let j=0; j<drumWaveTable[i].length; j++){
				drumWaveTable[i][j] = drumWaveTable[i][j]*100/32768;
			}
		}
		
        window.Organya = Organya;
    };
})();