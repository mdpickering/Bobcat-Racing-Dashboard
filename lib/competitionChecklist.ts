// A starter set of small jobs taken from the 2026 Baja SAE Technical Inspection Sheet (the checklist inspectors use at the
// competition). Each line is in the "Add several tasks" format: Subsystem | Category | Title | size | Description. Every task
// has a size, so each one goes on the pick-up board for anyone with free time. The rule numbers at the end of each
// description are the sheet's own, so a lead can look the requirement up. Check them against the rulebook for your season.

const L = (subsystem: string, category: string, title: string, size: 'quick' | 'short' | 'half_day', description: string) => `${subsystem} | ${category} | ${title} | ${size} | ${description}`

const FAB = 'Fabrication & Vehicle Integration'
const SHIELD = 'Shielding & Cockpit Safety'
const PEDAL = 'Pedal Box & Driver Controls'
const SAE = 'SAE Deliverables & Costing'

export const COMPETITION_CHECKLIST: string[] = [
  // Fabrication & Vehicle Integration: tow points, kill switches, battery, extinguishers, tags
  L(FAB, 'Safety Mounts & Tow Points', 'Make the front tow hitch', 'short', 'Tubular hitch, 1.00 to 1.25 in outside diameter, located between the lower frame side members and the side impact member. It must pass the hitch inspection gauge. (2026 tech sheet B.11.2)'),
  L(FAB, 'Safety Mounts & Tow Points', 'Make the rear tow hitch', 'short', 'Plate 0.125 to 0.375 in thick with a 1.0 to 1.25 in hole and at most 1.0 in edge distance. A fixed style must be at least 3.0 in wide. A swivel style needs a graded fastener and tabs 0.125 in thick with at least 3.0 in of weld. (B.11.3)'),
  L(FAB, 'Safety Mounts & Tow Points', 'Mount the right-side kill switch', 'short', "On the driver's right, behind the rear roll hoop, on a panel within about 15 degrees of square to the firewall and no more than 7 in below the top of the cage. Use one of the approved kill switch models. Mounting fasteners must meet B.12. (B.10.3.2, B.10.3.3)"),
  L(FAB, 'Safety Mounts & Tow Points', 'Mount the left-side kill switch', 'short', "On the driver's left along the side impact member, easy for the driver to reach, with no guard or cover over it. No other push-button switches on that side. Wiring must be sealed or secured so it cannot snag. (B.10.3.3, B.10.2)"),
  L(FAB, 'Safety Mounts & Tow Points', 'Make the battery mount', 'short', 'The battery must be sealed and secured so it cannot leak in a rollover, with the terminals protected from shorting and reverse polarity. (B.10.1.1)'),
  L(FAB, 'Safety Mounts & Tow Points', 'Mount the two fire extinguishers', 'short', "Right side, easy to reach, top of the extinguisher below the driver's eye and its top half above the side impact member. Use the approved quick-release mount (Drake or DV8) with 0.125 in tabs and fasteners that meet B.12, and keep clear room around the pull pin. (B.8.8)"),
  L(FAB, 'Safety Mounts & Tow Points', 'Label both fire extinguishers', 'quick', 'Label each one with the school name and car number. (B.8.8.1)'),
  L(FAB, 'Safety Mounts & Tow Points', 'Mount the RFID tag and lap transponder', 'quick', 'SAE RFID tag on the right upper rear roll hoop. Lap transponder on the right side, forward of the seat, within 24 in of the ground, facing the ground with a clear view. (B.13.6, B.13.2.3.2)'),

  // Shielding & Cockpit Safety: pieces of the larger Skid Plate, Body Panels and Firewall tasks
  L(SHIELD, 'Driver Firewall & Underbody Belly Pan', 'Cut the skid plate to span the cockpit', 'short', 'Measure the cockpit length and cut the plate. It must run the length of the cockpit and keep debris out. Metal, fiberglass or plastic are allowed. A piece of the larger Skid Plate task. (B.8.6)'),
  L(SHIELD, 'Driver Firewall & Underbody Belly Pan', 'Make cardboard templates for the body panels', 'short', 'Panels must cover the area between the lower frame side member and the side impact member, with no gap larger than 0.25 in (6.35 mm). A piece of the larger Body Panels task. (B.8.5)'),
  L(SHIELD, 'Driver Firewall & Underbody Belly Pan', 'Choose the quick-release fasteners for the body panels', 'short', 'Body panels must use quick-disconnect methods. A piece of the larger Body Panels task. (B.8.5)'),
  L(SHIELD, 'Driver Firewall & Underbody Belly Pan', 'Check all firewall and panel gaps against 0.25 in', 'quick', 'Gaps must be no larger than 6.35 mm (0.25 in), and the firewall must be metal at least 0.020 in thick. (B.8.3, B.8.5)'),
  L(SHIELD, 'Driver Firewall & Underbody Belly Pan', "Make the cover for the steering U-joint near the driver's feet", 'short', 'Open universal joints in the steering system near the driver\'s feet must be covered, and steering linkages shielded with a sturdy, full-width cover. (B.8.7)'),

  // Pedal Box & Driver Controls
  L(PEDAL, 'Throttle Pedal & Cable Pull', 'Add the wide-open throttle stop at the pedal', 'short', 'Foot-operated cable throttle only. A wide-open throttle stop is required at the pedal, and the cable may not be bare between the forward mount and the firewall. (B.7.2)'),

  // Fabrication & Vehicle Integration: lights, harness tabs, sharp edges
  L(FAB, 'Component Mounts & Brackets', 'Mount the brake light', 'short', 'Approved, unmodified brake light at least 1000 mm (39.4 in) off the ground, clearly visible in daylight and fully visible within 45 degrees either side of center. It must be completely off when the brakes are not applied. (B.10.4.1)'),
  L(FAB, 'Component Mounts & Brackets', 'Install a pressure switch on each brake circuit', 'short', 'Each independent brake circuit needs a hydraulic pressure switch, and either circuit alone must turn the brake light on. No disabling switch is allowed. (B.10.4.1)'),
  L(FAB, 'Double-Shear Tabs & Internal Sleeves', 'Check the harness tabs and bolts', 'quick', 'Lap-belt tabs must be in double shear, at least 0.090 in thick with at least 1.3125 in of weld, and the belt bolts at least 12 mm or 7/16 in. (B.4.2.5.2, B.4.2.6.3, B.12)'),
  L(FAB, 'Component Mounts & Brackets', 'Go over the car for sharp edges and deburr them', 'short', 'Inspectors check for sharp edges that could hurt drivers, crew or track workers. (B.3.4)'),

  // SAE Deliverables & Costing: paperwork the inspection asks for
  L(SAE, '', 'Weigh the primary spring, secondary spring and flyweights', 'quick', 'The tech sheet asks for these weights in grams, and the car must match the sheet it was approved with (a 75-point penalty applies if it does not). (2026 tech sheet, C2.6)'),
  L(SAE, '', 'Record the tire and damper details for the tech sheet', 'quick', 'Tire size, make and model, and damper make and model, front and rear, must match what is on the car. Also record the transmission make and model and the final drive ratio.'),
  L(SAE, 'Roll Cage Spec Sheet (RCSS)', 'Mark each roll cage weld sample', 'quick', "Each sample must be permanently marked with the welder's name, school and weld date. One destructive-test and one destructive-inspection sample are needed for each process each roll cage welder used. (B.3.2.15)"),
  L(SAE, 'Roll Cage Spec Sheet (RCSS)', 'Measure the roll cage tube wall thickness', 'quick', 'Check primary and secondary tube thickness in at least two places each. The minimums are 1.57 mm (0.062 in) and 0.89 mm (0.035 in). (B.3.2.16)'),
]

export const COMPETITION_CHECKLIST_TEXT = COMPETITION_CHECKLIST.join('\n')
