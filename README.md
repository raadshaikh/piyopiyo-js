# piyopiyo-js

By [IdioticBaka1824](https://github.com/raadshaikh), based on [Alula](https://github.com/alula)'s [Organya-JS](https://github.com/alula/organya-js).
(I would have forked that, but I already forked it once earlier to add org-3 drum support.)

PiyoPiyo in your browser! A Javascript-based player and editor for PiyoPiyo music files.

PiyoPiyo is a chiptune music format created by [Daisuke "Pixel" Amaya](https://twitter.com/oxizn), meant for use in his game [Ikachan](https://www.cavestory.org/pixels-works/ikachan.php).

Demo page: [https://raadshaikh.github.io/piyopiyo-js/piyopiyo-index.html](https://raadshaikh.github.io/piyopiyo-js/piyopiyo-index.html).

- piyopiyo.js - the main player component, it's all you need for playing .pmd files in browser.
- piyopiyo-ui.js - optional component that renders a piano roll on HTML5 canvas.

UI graphics were taken from the original PiyoPiyo Editor executable: https://www.cavestory.org/pixels-works/piyopiyo.php

---

### Issues:

- The playback kind of sucks, it's inaccurate and sounds weirdly stretched out as compared to the original player. I don't know why this is happening, please help (╥﹏╥) For the time being I pulled some weird hacks to make it sound as close as possible, marked by double question marks (??) in comments in the code.
- Probably related to the above, but the playback isn't visually 'smooth': the cursor sort of jumps between notes and doesn't proceed at a uniform speed.
- Sometimes the page doesn't work, but if you try refreshing it a couple of times, it starts working.
- Sound preview (when clicking the piano keys or placing a note) does not work for most drums.
- The fish cursor isn't working when I deploy this repository as a site ([it does work when I publish this page as a regular website](https://raadshaikh.github.io/music/piyopiyo-js/piyopiyo-index.html))

---

### Features/Help:

- All of Pixel's songs are available to listen to from the dropdown list provided in the demo page.
- You can also link to a .pmd file to play/edit it (not all hosting sites work, I recommend [File Garden](https://filegarden.com/)).
- You can conveniently share a link to a particular song you are listening to (instead of sharing the player's page and then telling someone the name/url of the song separately).
- Ctrl+click any element in the player to learn more about it!
- The interface consistes of a piano roll with a red progress bar under it, and under that are various settings and buttons.
    - The chick/duck thing in the progress bar represents the cursor, or your location in the song.
    - The markers for the start/end of the loop section are also found in the progress bar, and can be right-click-dragged to move them (or updated directly from the Waveform editor.)
- You can start a blank new song (Ctrl+B), or upload a .pmd song from your computer (Ctrl+O). You can also save the song in your browser by downloading it to your computer. The buttons for these three are at the bottom right.
    - You can also export the current song as a MIDI by right-clicking the save icon, or by pressing Ctrl+Alt+M.
- Click on the piano roll to place notes, click on a note to delete it.
    - Note that PiyoPiyo allows you to place multiple notes at a single location, unlike Organya.
- Click on the piano keys at the left to preview how a note sounds.
- Press 1, 2, 3, 4/P to select the corresponding track to be able to edit it (this also highlights the corresponding notes). You can also click on the track buttons.
    - Track P is for drums, and each note represents a different drum instrument. Odd notes are played slightly quieter.
    - Right-click a track button to mute it (or press M after selecting a track). You can also press S to solo the selected track (i.e. mute all other tracks).
- Click and drag in the progress bar to make a selection (to later copy/delete notes). You can also select notes by holding Shift and pressing Left/Right. 
- There are two editing modes, as indicated by which icon the red circle is on:
    - Pencil mode, where you place notes one at a time (or delete them) is the default.
    - If you select some notes and press the duplicate icon (or Ctrl+C), you enter Duplication mode, where clicking anywhere on the piano roll will insert the copied notes at that location. (Pressing Ctrl+V inserts the copied notes at the cursor's location.) Note that this only works for one track at a time.
        - Click the pencil icon or press Tab to return to Pencil mode.
- Pressing Backspace or Delete, or clicking the Delete button, will erase all notes in the selection.
- You can set whether or not the song's playback should loop by clicking the loop button.
- You can temporarily disable the piano roll display and editing functionality by clicking the LowSpec button. This is a bit easier on your computer, so it may help if the playback is lagging.

##### Pressing Enter, or clicking the waveform icon, will open up the Waveform Editor.
- Here you can edit the instrument properties of the selected track.
- Click and drag in the waveform window to set the timbre of the instrument. Some common wave shapes are provided as presets on the right.
- The Envelope window sets the volume profile of each note of the instrument. Again, some presets are provided.
- You can also change the icon for the notes as depicted in the piano roll. Enjoy Pixel's cute art and pick something suitable for your song!
- Edit any of the numerical fields below either by clicking on it and pressing up/down to increment/decrement the value, or by right-clicking on it and entering the desired number directly.
- Volume sets the volume of the track on a 0-300 scale.
- Length is the duration of one note, where a value of 22050 corresponds to 1 second.
- PiyoPiyo supports 24 possible values for the notes in any track, corresponding to a range of two octaves. For example, if the Octave field is set to 2, then the notes of that track can range from C2 to B3.
- The 'Others' tab has properties for the song overall.
- Music Wait is the duration of one sub-beat in milliseconds. It is equal to 15000/BPM.
- Music Size is the file size, in sub-beats. This is the maximum number of sub-beats the song will store. Typically this coincides with the end marker of the looping section.
- Music Start/End set the boundaries of the looping section of the song.

##### Credits
- [PiyoPiyo Editor/Player](https://www.cavestory.org/pixels-works/piyopiyo.php) by [Daisuke "Pixel" Amaya](https://twitter.com/oxizn)
- [Organya-JS](https://github.com/alula/organya-js) by [Alula](https://github.com/alula)
- [PiyoPiyo file format decoding](https://forum.cavestory.org/threads/piyopiyo-file-format.5917/) by [Gamemanj/20kdc](https://github.com/20kdc)
- Two obscure sample songs provided by [Ahotcho](https://forum.cavestory.org/members/ahotcho.10652/)
- MIDI export functionality by [Grimmdude](https://github.com/grimmdude/MidiWriterJS)

---

[Let me know](https://raadshaikh.github.io/contact.html) if you liked this, hated it, or want something more in it.

Have fun!