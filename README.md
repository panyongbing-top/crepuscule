import {
  Crepuscule,
  CrepusculeLive
} from "crepuscule";

// You first need to instanciate your Map object from MapLibre or MapTiler SDK.

// Instanciate the Crepuscule instance:
const crepObj = new CrepusculeLive(map);

// Alternatively with some options:
const crepObj = new CrepusculeLive(map, {
  color: [0, 12, 55], // RGB in [0, 255]
  opacity: 0.7,       // in [0, 1] 
  date: new Date(),   // any date
  debug: true,        // removes the twilight gradient
});

// You can hide and show the Crepuscule layer:
crepObj.hide();
crepObj.show();

// Alternatively, both hide and show can take some option to make smooth transitions:
crepObj.show({
  duration: 1000,  // Millisconds it takes to fade in or out
  delay: 100,      // Milliseconds it takes to start showing/hiding
});

// You can update the date of the Crepuscule instance
crepObj.setDate(new Date(...));

// Remove the layers and source created by this Crepuscule instance
crepObj.unmount();
