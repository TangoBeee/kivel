// Reference data for the identity generator. Names, streets and places are common real values so
// records read naturally. Phone numbers are built only from ranges each national regulator keeps
// free for fiction, so a generated number can never reach a subscriber.
export interface Place {
    city: string;
    region: string;
    regionCode: string;
    // Postal code stems that belong to the city. Each locale completes them in its own format.
    postal: readonly string[];
    // Dialling prefix used with the locale's fiction range.
    dial: string;
}
export interface LocaleData {
    country: string;
    countryName: string;
    female: readonly string[];
    male: readonly string[];
    last: readonly string[];
    streets: readonly string[];
    suffixes: readonly string[];
    places: readonly Place[];
    companyEnd: readonly string[];
}
const place = (
    city: string,
    region: string,
    regionCode: string,
    postal: string,
    dial: string,
): Place => ({ city, region, regionCode, postal: postal.split(' '), dial });
const list = (value: string) => value.split(' ');
const phrases = (value: string) => value.split(', ');

const englishFemale = list(
    'Olivia Emma Charlotte Amelia Sophia Isabella Ava Mia Evelyn Harper Abigail Emily Ella Elizabeth Camila Luna Sofia Avery Mila Aria Scarlett Penelope Layla Chloe Victoria Madison Eleanor Grace Nora Riley Zoey Hannah Hazel Lily Ellie Violet Lillian Zoe Stella Aurora Natalie Emilia Everly Leah Aubrey Willow Addison Lucy Audrey Bella Nova Brooklyn Paisley Savannah Claire Skylar Isla Genesis Naomi Elena Caroline Eliana Anna Maya Valentina Ruby Kennedy Ivy Ariana Aaliyah Cora Madelyn Alice Kinsley Hailey Gabriella Allison Gianna Serenity Samantha Sarah Autumn Quinn Eva Piper Sophie Sadie Delilah Josephine Nevaeh Adeline Arya Emery Lydia Clara Vivian Madeline Peyton Julia Rylee Brielle Reagan Natalia Jade Athena Maria Leilani Everleigh Liliana Melanie Mackenzie Hadley Raelynn Kaylee Rose Arianna Isabelle Melody Eliza Lyla Katherine Aubree Adalynn Kylie Faith Mary Margaret Ximena Iris Alexandra Jasmine Charlie Amaya Taylor Isabel Ashley Khloe Ryleigh Alexa Amara Valeria Andrea Parker Norah Eden Elliana Brianna Emersyn Valerie Anastasia Eloise Emerson Cecilia Remi Josie Alina Reese Bailey Lucia Adalyn Molly Ayla Sara Daisy London Jordyn Esther Genevieve Harmony Annabelle Alyssa Ariel Aliyah Londyn Juliana Morgan Summer Juliette Trinity Callie Sienna Blakely Alaia Kayla Teagan Alaina Brynlee Finley Catalina Sloane Rachel Lilly Ember Kimberly Juniper Sydney Arabella Gemma Jocelyn Freya June Lauren Amy Presley Georgia Journee Elise Rosalie Ada Laila Brooke Diana Olive River Payton Ariella Daniela Raegan Alayna Gracie Mya Blake Noelle Ana Leila Paige Lila Nicole Rowan Hope Ruth Alana Selena Marley Kamila Alexis Mckenzie Zara Millie Magnolia Kali Kehlani Catherine Maeve Adelyn Sutton Haven Julianna Vera Nina Priya Amina Mei Aisha Fatima Leah Tessa Carmen Jenna Megan Heather Stephanie Jessica Jennifer Amanda Melissa Michelle Rebecca Laura Christina Kelly Angela Shannon Erin Danielle Kristen Lindsey Monica Tiffany Vanessa Veronica Whitney',
);
const englishMale = list(
    'Liam Noah Oliver James Elijah William Henry Lucas Benjamin Theodore Mateo Levi Sebastian Daniel Jack Michael Alexander Owen Asher Samuel Ethan Leo Jackson Mason Ezra John Hudson Luca Aiden Joseph David Jacob Logan Luke Julian Gabriel Grayson Wyatt Matthew Maverick Dylan Isaac Elias Anthony Thomas Jayden Carter Santiago Ezekiel Charles Josiah Caleb Cooper Lincoln Miles Christopher Nathan Isaiah Kai Joshua Andrew Angel Adrian Cameron Nolan Waylon Jaxon Roman Eli Wesley Aaron Ian Christian Ryan Leonardo Brooks Axel Walker Jonathan Easton Everett Weston Bennett Robert Jameson Landon Silas Jose Beau Micah Colton Jordan Jeremiah Parker Greyson Rowan Adam Nicholas Theo Xavier Hunter Dominic Jace Gael River Thiago Kayden Damian August Carson Austin Myles Amir Declan Emmett Ryder Luka Connor Jaxson Milo Enzo Giovanni Vincent Diego Luis Archer Harrison Kingston Atlas Jasper Sawyer Legend Lorenzo Evan Jonah Chase Bryson Adriel Nathaniel Arthur Juan George Cole Zion Jason Ashton Carlos Calvin Brayden Elliot Rhett Emiliano Ace Jayce Graham Max Braxton Leon Ivan Hayden Jude Malachi Dean Tyler Jesus Zachary Kaiden Elliott Arlo Emmanuel Ayden Bentley Maxwell Amari Ryker Finn Antonio Charlie Maddox Justin Judah Kevin Dawson Matteo Miguel Zayden Camden Messiah Alan Alex Nicolas Felix Alejandro Jesse Beckett Matias Tucker Emilio Xander Knox Oscar Beckham Timothy Abraham Andres Gavin Brody Barrett Hayes Jett Brandon Joel Victor Peter Abel Edward Karter Patrick Richard Grant Avery King Caden Adonis Riley Tristan Kyrie Blake Eric Griffin Malakai Rafael Israel Tate Lukas Nico Marcus Stetson Javier Colt Omar Simon Kash Remington Jeremy Louis Mark Lennox Callum Kairo Nash Kyler Dallas Crew Preston Paxton Steven Zane Kaleb Lane Phoenix Paul Cash Kenneth Bryce Ronan Kaden Maximiliano Walter Maximus Emerson Hendrix Jax Atticus Zayn Tobias Cohen Aziel Kayson Rory Brady Finley Holden Jorge Malcolm Clayton Niko Francisco Josue Brian Bryan Cade Colin Andre Cayden Aidan Muhammad Derek Ali Elian Bodhi Cody Jensen Damien Martin Cairo Ellis Khalil Otto Zander Dante Ismael Angelo Brantley Manuel Colson Cruz Tatum Jaylen Jaden Erick Cristian Romeo Milan Reid Cyrus Leonel Joaquin Ari Odin Orion Ezequiel Gideon Daxton Warren Casey Anderson Spencer Karson Eduardo Chance Fernando Raymond Bradley Cesar Wade Prince Julius Dakota Kade Koa Raiden Callan Hector Onyx Remy Ricardo Edwin Stephen Kane Saint Titus Desmond Killian Sullivan Mario Jay Kamari Luciano Royal Zyaire Marco Wilder Russell Nasir Rylan Archie Jared Gianni Kashton Kobe Sergio Travis Marshall Iker Briggs Gunner Apollo Bowen Baylor Sage Tyson Kyle Oakley Malik Mathias Sean Armani Hugo Johnny Arjun Wei Ahmed Scott Gregory Jeffrey Keith Douglas Dennis Craig Todd Shane Trevor Mitchell Corey Dustin Brett Shawn Curtis Darren',
);
// Names common for people born before the 1980s, so an older record does not carry a name
// that only became popular decades after their birth.
export const olderFemale = list(
    'Mary Patricia Linda Barbara Elizabeth Susan Margaret Dorothy Lisa Nancy Karen Betty Helen Sandra Donna Carol Ruth Sharon Michelle Laura Sarah Kimberly Deborah Jessica Shirley Cynthia Angela Melissa Brenda Amy Anna Rebecca Virginia Kathleen Pamela Martha Debra Amanda Stephanie Carolyn Christine Marie Janet Catherine Frances Ann Joyce Diane Alice Julie Heather Teresa Doris Gloria Evelyn Jean Cheryl Mildred Katherine Joan Judith Rose Janice Kelly Nicole Judy Christina Kathy Theresa Beverly Denise Tammy Irene Jane Lori Rachel Marilyn Andrea Kathryn Louise Sara Anne Jacqueline Wanda Bonnie Julia Lois Tina Phyllis Norma Paula Diana Lillian Robin Peggy Gladys Rita Dawn Connie Florence Tracy Edna Carmen Rosa Cindy Wendy Victoria Edith Sherry Sylvia Josephine Shannon Sheila Ellen Elaine Marjorie Carrie Monica Esther Pauline Juanita Anita Rhonda Debbie Leslie Joanne Eleanor Valerie Gail Darlene Jill Geraldine Cathy Joann Lorraine Lynn Sally Regina Beatrice Dolores Audrey Yvonne Annette June Marion Dana Stacy Renee Vivian Roberta Holly Loretta Yolanda Jeanette Laurie Kristen Alma Sue Beth Jeanne Maureen Colleen Gwendolyn Patsy',
);
export const olderMale = list(
    'James John Robert Michael William David Richard Charles Joseph Thomas Christopher Daniel Paul Mark Donald George Kenneth Steven Edward Brian Ronald Anthony Kevin Jason Matthew Gary Timothy Jose Larry Jeffrey Frank Scott Eric Stephen Andrew Raymond Gregory Jerry Dennis Walter Patrick Peter Harold Douglas Henry Carl Arthur Roger Joe Juan Jack Albert Terry Gerald Keith Samuel Willie Ralph Lawrence Roy Bruce Harry Fred Wayne Billy Steve Louis Randy Howard Eugene Carlos Russell Bobby Victor Martin Ernest Phillip Todd Craig Alan Clarence Philip Johnny Earl Jimmy Danny Tony Mike Stanley Leonard Dale Manuel Rodney Curtis Norman Allen Marvin Vincent Glenn Travis Jeff Chad Lee Melvin Alfred Francis Herbert Frederick Ray Edwin Don Eddie Ricky Troy Randall Barry Bernard Mario Leroy Francisco Marcus Theodore Clifford Jay Jim Tom Calvin Ronnie Bill Lloyd Tommy Leon Warren Darrell Jerome Floyd Alvin Tim Gordon Dean Greg Jorge Pedro Derrick Dan Lewis Herman Maurice Vernon Roberto Clyde Glen Hector Ricardo Rick Lester Brent Ramon Gilbert Gene Duane Dwayne Neil Ross Stuart Graham Colin Nigel Trevor Derek Malcolm',
);
const usLast = list(
    'Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez Wilson Anderson Thomas Taylor Moore Jackson Martin Lee Perez Thompson White Harris Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright Scott Torres Nguyen Hill Flores Green Adams Nelson Baker Hall Rivera Campbell Mitchell Carter Roberts Gomez Phillips Evans Turner Diaz Parker Cruz Edwards Collins Reyes Stewart Morris Morales Murphy Cook Rogers Gutierrez Ortiz Morgan Cooper Peterson Bailey Reed Kelly Howard Ramos Kim Cox Ward Richardson Watson Brooks Chavez Wood James Bennett Gray Mendoza Ruiz Hughes Price Alvarez Castillo Sanders Patel Myers Long Ross Foster Jimenez Powell Jenkins Perry Russell Sullivan Bell Coleman Butler Henderson Barnes Gonzales Fisher Vasquez Simmons Romero Jordan Patterson Alexander Hamilton Graham Reynolds Griffin Wallace Moreno West Cole Hayes Bryant Herrera Gibson Ellis Tran Medina Aguilar Stevens Murray Ford Castro Marshall Owens Harrison Fernandez McDonald Woods Washington Kennedy Wells Vargas Henry Chen Freeman Webb Tucker Guzman Burns Crawford Olson Simpson Porter Hunter Gordon Mendez Silva Shaw Snyder Mason Dixon Munoz Hunt Hicks Holmes Palmer Wagner Black Robertson Boyd Rose Stone Salazar Fox Warren Mills Meyer Rice Schmidt Garza Daniels Ferguson Nichols Stephens Soto Weaver Ryan Gardner Payne Grant Dunn Kelley Spencer Hawkins Arnold Pierce Vazquez Hansen Peters Santos Hart Bradley Knight Elliott Cunningham Duncan Armstrong Hudson Carroll Lane Riley Andrews Alvarado Ray Delgado Berry Perkins Hoffman Johnston Matthews Pena Richards Contreras Willis Carpenter Lawrence Sandoval Guerrero George Chapman Rios Estrada Ortega Watkins Greene Nunez Wheeler Valdez Harper Burke Larson Santiago Maldonado Morrison Franklin Carlson Austin Dominguez Carr Lawson Jacobs OBrien Lynch Singh Vega Bishop Montgomery Oliver Jensen Harvey Williamson Gilbert Dean Sims Espinoza Howell Li Wong Reid Hanson Le McCoy Garrett Burton Fuller Wang Weber Welch Rojas Lucas Marquez Fields Park Yang Little Banks Padilla Day Walsh Bowman Schultz Luna Fowler Mejia Davidson Acosta Brewer May Holland Juarez Newman Pearson Curtis Cortez Douglas Schneider Joseph Barrett Navarro Figueroa Keller Avila Wade Molina Stanley Hopkins Campos Barnett Bates Chambers Caldwell Beck Lambert Miranda Byrd Craig Ayala Lowe Frazier Powers Neal Leonard Gregory Carrillo Sutton Fleming Rhodes Shelton Schwartz Norris Jennings Watts Duran Walters Cohen McDaniel Moran Parks Steele Vaughn Becker Holt DeLeon Barker Terry Hale Leon Hail Benson Haynes Horton Miles Lyons Pham Graves Bush Thornton Wolfe Warner Cabrera McKinney Mann Zimmerman Dawson Lara Fletcher Page McCarthy Love Robles Cervantes Solis Erickson Reeves Chang Klein Salinas Fuentes Baldwin Daniel Simon Velasquez Hardy Higgins Aguirre Lin Cummings Chandler Sharp Barber Bowen Ochoa Dennis Robbins Liu Ramsey Francis Griffith Paul Blair OConnor Cardenas Pacheco Cross Calderon Quinn Moss Swanson Chan Rivas Khan Rodgers Serrano Fitzgerald Rosales Stevenson Christensen Manning Gill Curry McLaughlin Harmon McGee Gross Doyle Garner Newton Burgess Reese Walton Blake Trujillo Adkins Brady Goodman Roman Webster Goodwin Fischer Huang Potter Delacruz Montoya Todd Wu Hines Mullins Castaneda Malone Cannon Tate Mack Sherman Hubbard Hodges Zhang Guerra Wolf Valencia Saunders Franco Rowe Gallagher Farmer Hammond Hampton Townsend Ingram Wise Gallegos Clarke Barton Schroeder Maxwell Waters Logan Camacho Strickland Norman Person Colon Parsons Frank Harrington Glover Osborne Buchanan Casey Floyd Patton Ibarra Ball Tyler Suarez Bowers Orozco Salas Cobb Gibbs Andrade Bauer Conner Moody Escobar McGuire Lloyd Mueller Hartman French Kramer McBride Pope Lindsey Velazquez Norton McCormick Sparks Flynn Yates Hogan Marsh Macias Villanueva Zamora Pratt Stokes Owen Ballard Lang Brock Villarreal Charles Drake Barrera Cain Patrick Pineda Burnett Mercado Santana Shepherd Bautista Ali Shaffer Lamb Trevino McKenzie Hess Beil Olsen Cochran Morton Nash Wilkins Petersen Briggs Shah Roth Nicholson Holloway Lozano Rangel Flowers Hoover Short Arias Mora Valenzuela Bryan Meyers Weiss Underwood Bass Greer Summers Houston Carson Morrow Clayton Whitaker Decker Yoder Collier Zuniga Carey Wilcox Melendez Poole Roberson Larsen Conley Davenport Copeland Massey Lam Huff Rocha Cameron Jefferson Hood Monroe Anthony Pittman Huynh Randall Singleton Kirk Combs Mathis Christian Skinner Bradford Richard Galvan Wall Boone Kirby Wilkinson Bridges Bruce Atkinson Velez Meza Roy Vincent York Hodge Villa Abbott Allison Tapia Gates Chase Sosa Sweeney Farrell Wyatt Dalton Horn Barron Phelps Yu Dickerson Heath Foley Atkins Mathews Bonilla Acevedo Benitez Zavala Hensley Glenn Cisneros Harrell Shields Rubio Huffman Choi Boyer Garrison Arroyo Bond Kane Hancock Callahan Dillon Cline Wiggins Grimes Arellano Melton ONeill Savage Ho Beltran Pitts Parrish Ponce Rich Booth Koch Golden Ware Brennan McDowell Marks Cantu Humphrey Baxter Sawyer Clay Tanner Hutchinson Kaur Berg Wiley Gilmore Russo Villegas Hobbs Keith Wilkerson Ahmed Beard McClain Montes Mata Rosario Vang Walter Henson ONeal Mosley McClure Beasley Stephenson Snow Huerta Preston Vance Barry Johns Eaton Blackwell Dyer Prince Macdonald Solomon Guevara Stafford English Hurst Woodard Cortes Shannon Kemp Nolan McCullough Merritt Murillo Moon Salgado Strong Kline Cordova Barajas Roach Rosas Winters Jacobson Lester Knox Bullock Kerr Leach Meadows Davila Orr Whitehead Pruitt Kent Conway McKee Barr David Dejesus Marin Berger McIntyre Blankenship Gaines Palacios Cuevas Bartlett Durham Dorsey McCall ODonnell Stein Browning Stout Lowery Sloan McLean Hendricks Calhoun Sexton Chung Gentry Hull Duarte Ellison Nielsen Gillespie Buck Middleton Sellers Leblanc Esparza Hardin Bradshaw McIntosh Howe Livingston Frost Glass Morse Knapp Herman Stark Bravo Noble Spears Weeks Corona Frederick Buckley McFarland Hebert Enriquez Hickman Quintero Randolph Schaefer Walls Trejo House Reilly Pennington Michael Conrad Giles Benjamin Crosby Fitzpatrick Donovan Mays Mahoney Valentine Raymond Medrano Hahn McMillan Small Bentley Felix Peck Lucero Boyle Hanna Pace Rush Hurley Harding McConnell Bernal Nava Ayers Everett Ventura Avery Pugh Mayer Bender Shepard McMahon Landry Case Sampson Moses Magana Blackburn Dunlap Gould Duffy Vaughan Herring McKay Espinosa Rivers Farley Bernard Ashley Friedman Potts Truong Costa Correa Blevins Nixon Clements Fry Delarosa Best Benton Lugo Portillo Dougherty Crane Haley Phan Villalobos Blanchard Horne Finley Quintana Lynn Esquivel Bean Dodson Mullen Xiong Hayden Cano Levy Huber Richmond Moyer Lim Frye Sheppard McCarty Avalos Booker Waller Parra Woodward Jaramillo Krueger Rasmussen Brandt Peralta Donaldson Stuart Faulkner Maynard Galindo Coffey Estes Sanford Burch Maddox Vo OConnell Vu Andersen Spence McPherson Church Schmitt Stanton Leal Cherry Compton Dudley Sierra Pollard Alfaro Hester Proctor Lu Hinton Novak Good Madden McCann Terrell Jarvis Dickson Reyna Cantrell Mayo Branch Hendrix Rollins Rowland Whitney Duke Odom Daugherty Travis Tang',
);
const usStreets = phrases(
    'Main, Oak, Maple, Cedar, Elm, Pine, Washington, Lake, Hill, Walnut, Spring, North, Ridge, Church, Willow, Mill, Sunset, Railroad, Jackson, Cherry, West, South, Center, Highland, Johnson, Forest, Jefferson, Hickory, Wilson, River, Meadow, Valley, East, Chestnut, Franklin, Adams, Spruce, Laurel, Dogwood, Lincoln, Madison, Park, Poplar, Locust, Hillcrest, Sycamore, Lakeview, Birch, Magnolia, Woodland, Davis, Fairview, Williams, Green, Lee, College, Cottonwood, Aspen, Summit, Liberty, Taylor, Smith, Monroe, Prospect, Pleasant, Grove, Broad, Harrison, Linden, Vine, Beech, Garfield, Garden, Juniper, Clark, Grant, Bridge, Heather, Hawthorne, Canyon, Orchard, Elizabeth, Brookside, Sherwood, Country Club, Briarwood, Fox Run, Deerfield, Timber, Shady, Rosewood, Stonegate, Quail Run, Autumn, Windsor, Cambridge, Holly, Ivy, Front, Mulberry, Kings, Old Mill, Bayview, Crestview, Foxglove, Pheasant, Sandy, Tanglewood, Whispering Pines, Coventry, Devon, Hamilton, Carriage, Colonial, Glenwood, Ashland, Belmont, Clinton, Fulton, Harvard, Irving, Kensington, Lexington, Marshall, Newton, Oxford, Pearl, Quincy, Richmond, Sheridan, Tremont, Union, Vernon, Warren, York',
);
const usSuffixes = list('St St St Ave Ave Ave Dr Dr Rd Rd Ln Ln Ct Way Blvd Pl Ter Cir Trl');
const usPlaces: readonly Place[] = [
    place(
        'New York',
        'New York',
        'NY',
        '10001 10003 10011 10016 10019 10023 10025 10028 10036 10128',
        '212',
    ),
    place('Brooklyn', 'New York', 'NY', '11201 11205 11211 11215 11217 11222 11231 11238', '718'),
    place('Buffalo', 'New York', 'NY', '14201 14209 14213 14216 14222', '716'),
    place(
        'Los Angeles',
        'California',
        'CA',
        '90004 90012 90026 90027 90034 90042 90046 90065',
        '213',
    ),
    place('San Diego', 'California', 'CA', '92101 92103 92104 92109 92116 92122', '619'),
    place('San Jose', 'California', 'CA', '95112 95116 95123 95125 95126 95128', '408'),
    place('San Francisco', 'California', 'CA', '94103 94107 94110 94114 94117 94122', '415'),
    place('Sacramento', 'California', 'CA', '95811 95814 95816 95818 95819', '916'),
    place('Fresno', 'California', 'CA', '93701 93704 93711 93720 93727', '559'),
    place('Chicago', 'Illinois', 'IL', '60607 60613 60614 60618 60622 60640 60647 60657', '312'),
    place('Naperville', 'Illinois', 'IL', '60540 60563 60564 60565', '630'),
    place('Houston', 'Texas', 'TX', '77002 77006 77007 77008 77019 77025 77098', '713'),
    place('San Antonio', 'Texas', 'TX', '78201 78209 78212 78216 78230', '210'),
    place('Dallas', 'Texas', 'TX', '75201 75204 75206 75214 75219 75230', '214'),
    place('Austin', 'Texas', 'TX', '78701 78702 78704 78745 78751 78757', '512'),
    place('Fort Worth', 'Texas', 'TX', '76102 76104 76107 76109 76116', '817'),
    place('El Paso', 'Texas', 'TX', '79901 79902 79912 79925 79936', '915'),
    place('Phoenix', 'Arizona', 'AZ', '85003 85004 85013 85016 85018 85032', '602'),
    place('Tucson', 'Arizona', 'AZ', '85701 85705 85711 85716 85719', '520'),
    place('Philadelphia', 'Pennsylvania', 'PA', '19103 19106 19107 19123 19130 19147', '215'),
    place('Pittsburgh', 'Pennsylvania', 'PA', '15201 15206 15213 15217 15222', '412'),
    place('Jacksonville', 'Florida', 'FL', '32204 32205 32207 32210 32217', '904'),
    place('Miami', 'Florida', 'FL', '33125 33130 33133 33137 33145', '305'),
    place('Tampa', 'Florida', 'FL', '33602 33606 33609 33611 33629', '813'),
    place('Orlando', 'Florida', 'FL', '32801 32803 32804 32806 32812', '407'),
    place('Columbus', 'Ohio', 'OH', '43201 43202 43206 43212 43215', '614'),
    place('Cleveland', 'Ohio', 'OH', '44102 44106 44109 44113 44118', '216'),
    place('Cincinnati', 'Ohio', 'OH', '45202 45206 45208 45209 45220', '513'),
    place('Charlotte', 'North Carolina', 'NC', '28202 28203 28205 28209 28211', '704'),
    place('Raleigh', 'North Carolina', 'NC', '27601 27603 27605 27607 27609', '919'),
    place('Indianapolis', 'Indiana', 'IN', '46202 46203 46205 46220 46240', '317'),
    place('Seattle', 'Washington', 'WA', '98101 98103 98105 98112 98115 98122', '206'),
    place('Spokane', 'Washington', 'WA', '99201 99203 99205 99208 99223', '509'),
    place('Denver', 'Colorado', 'CO', '80202 80203 80205 80206 80210 80211', '303'),
    place('Colorado Springs', 'Colorado', 'CO', '80903 80904 80906 80909 80918', '719'),
    place('Washington', 'District of Columbia', 'DC', '20001 20002 20003 20009 20010 20016', '202'),
    place('Boston', 'Massachusetts', 'MA', '02108 02115 02116 02118 02127 02130', '617'),
    place('Worcester', 'Massachusetts', 'MA', '01602 01604 01605 01606 01609', '508'),
    place('Nashville', 'Tennessee', 'TN', '37203 37204 37206 37209 37212', '615'),
    place('Memphis', 'Tennessee', 'TN', '38103 38104 38111 38117 38120', '901'),
    place('Detroit', 'Michigan', 'MI', '48201 48202 48207 48214 48226', '313'),
    place('Grand Rapids', 'Michigan', 'MI', '49503 49504 49505 49506 49507', '616'),
    place('Oklahoma City', 'Oklahoma', 'OK', '73102 73103 73106 73112 73118', '405'),
    place('Portland', 'Oregon', 'OR', '97202 97209 97211 97212 97214 97217', '503'),
    place('Las Vegas', 'Nevada', 'NV', '89101 89102 89104 89117 89128', '702'),
    place('Louisville', 'Kentucky', 'KY', '40202 40204 40205 40206 40207', '502'),
    place('Baltimore', 'Maryland', 'MD', '21201 21202 21210 21211 21224 21230', '410'),
    place('Milwaukee', 'Wisconsin', 'WI', '53202 53207 53208 53211 53212', '414'),
    place('Madison', 'Wisconsin', 'WI', '53703 53704 53705 53711 53715', '608'),
    place('Albuquerque', 'New Mexico', 'NM', '87102 87104 87106 87108 87110', '505'),
    place('Kansas City', 'Missouri', 'MO', '64108 64109 64110 64111 64112', '816'),
    place('St. Louis', 'Missouri', 'MO', '63103 63104 63108 63110 63116', '314'),
    place('Atlanta', 'Georgia', 'GA', '30303 30306 30307 30308 30309 30312', '404'),
    place('Savannah', 'Georgia', 'GA', '31401 31404 31405 31406', '912'),
    place('Omaha', 'Nebraska', 'NE', '68102 68104 68105 68106 68132', '402'),
    place('Minneapolis', 'Minnesota', 'MN', '55401 55403 55405 55407 55408 55414', '612'),
    place('New Orleans', 'Louisiana', 'LA', '70115 70116 70117 70118 70119 70130', '504'),
    place('Salt Lake City', 'Utah', 'UT', '84101 84102 84103 84105 84106', '801'),
    place('Richmond', 'Virginia', 'VA', '23219 23220 23221 23223 23225', '804'),
    place('Virginia Beach', 'Virginia', 'VA', '23451 23452 23454 23456 23462', '757'),
    place('Birmingham', 'Alabama', 'AL', '35203 35205 35209 35213 35222', '205'),
    place('Charleston', 'South Carolina', 'SC', '29401 29403 29407 29412 29414', '843'),
    place('Des Moines', 'Iowa', 'IA', '50309 50310 50311 50312 50315', '515'),
    place('Boise', 'Idaho', 'ID', '83702 83703 83704 83705 83706', '208'),
    place('Hartford', 'Connecticut', 'CT', '06103 06105 06106 06112 06114', '860'),
    place('Providence', 'Rhode Island', 'RI', '02903 02905 02906 02908 02909', '401'),
    place('Newark', 'New Jersey', 'NJ', '07102 07103 07104 07105 07106', '973'),
    place('Jersey City', 'New Jersey', 'NJ', '07302 07304 07305 07306 07307', '201'),
    place('Honolulu', 'Hawaii', 'HI', '96813 96814 96815 96816 96822', '808'),
    place('Anchorage', 'Alaska', 'AK', '99501 99503 99504 99507 99508', '907'),
    place('Little Rock', 'Arkansas', 'AR', '72201 72202 72204 72205 72207', '501'),
    place('Wichita', 'Kansas', 'KS', '67202 67203 67206 67208 67211', '316'),
    place('Portland', 'Maine', 'ME', '04101 04102 04103', '207'),
    place('Burlington', 'Vermont', 'VT', '05401 05408', '802'),
    place('Manchester', 'New Hampshire', 'NH', '03101 03102 03103 03104', '603'),
    place('Wilmington', 'Delaware', 'DE', '19801 19802 19805 19806', '302'),
    place('Billings', 'Montana', 'MT', '59101 59102 59105', '406'),
    place('Fargo', 'North Dakota', 'ND', '58102 58103 58104', '701'),
    place('Sioux Falls', 'South Dakota', 'SD', '57103 57104 57105 57106', '605'),
    place('Cheyenne', 'Wyoming', 'WY', '82001 82007 82009', '307'),
    place('Charleston', 'West Virginia', 'WV', '25301 25302 25304 25311', '304'),
    place('Jackson', 'Mississippi', 'MS', '39201 39202 39206 39211', '601'),
];
const ukLast = list(
    'Smith Jones Taylor Brown Williams Wilson Johnson Davies Robinson Wright Thompson Evans Walker White Roberts Green Hall Wood Jackson Clarke Patel Khan Lewis James Phillips Mason Mitchell Rose Davis Rodgers Cox Alexander Kelly Hughes Edwards Thomas Harris Martin Cooper King Lee Baker Harrison Morgan Allen Scott Watson Bennett Ward Turner Carter Parker Cook Richardson Bailey Collins Bell Shaw Murphy Miller Young Morris Marshall Simpson Price Anderson Adams Wilkinson Foster Ellis Murray Chapman Powell Webb Rogers Gray Mills Hunt Palmer Holmes Campbell Matthews Barnes Knight Lloyd Butler Russell Fisher Barker Stevens Jenkins Dixon Fletcher Harvey Pearson Graham Howard Gibson Reynolds Hamilton Stewart Saunders Andrews Ford Payne Pearce Elliott West Brooks Lawrence Owen Atkinson Bradley Reid Spencer Dawson Walsh Hussain Ali Ahmed Begum Singh Kaur Shah Sharma Hart Fox Gill Cole Booth Grant Stone Hudson Burton Kennedy Hopkins Barrett Newman Lane Dean Coleman Gregory Griffiths Armstrong Hayes Sutton Burns Harding Marsh Chambers Woods Day Hawkins Perry Watts Wells Long Porter Bishop Bates Francis Riley Gardner Lowe Parsons Nicholson Byrne Freeman Hardy Hill Goodwin Sharp Field Doyle Davidson Pritchard Whitehead Thornton Kerr Holt Carr Berry Sinclair Fraser MacDonald Mackenzie Douglas Henderson Morrison Paterson Crawford Cameron Duncan Ferguson Boyle Gallagher ONeill Doherty McCarthy Hartley Barlow Ashworth Entwistle Holden Greenwood Haworth Ramsbottom Sykes Naylor Ackroyd Bannister Hargreaves Whittaker Pickering Calvert Thorpe Braithwaite Middleton Fairclough Winstanley Nuttall',
);
const ukStreets = phrases(
    'High, Station, Church, Park, Victoria, Green, Manor, Kings, Queens, New, Grange, North, South, West, Alexandra, Mill, Springfield, George, School, Chapel, London, York, Albert, Windsor, Stanley, Highfield, The Avenue, The Crescent, Richmond, Broadway, Grove, Orchard, Meadow, Elm, Oak, Beech, Cedar, Willow, Ash, Hawthorn, Sycamore, Rowan, Maple, Holly, Chestnut, Lime Tree, Priory, Abbey, Castle, Cromwell, Nelson, Wellington, Clarence, Gloucester, Lancaster, Cambridge, Oxford, Salisbury, Westfield, Eastfield, Brookside, Riverside, Woodlands, Fairfield, Greenway, Hillside, Kingsway, Queensway, Ridgeway, Rectory, Vicarage, Foundry, Market, Bridge, Canal, Dock, Wharf, Tannery, Cobden, Regent, Sandringham, Balmoral, Marlborough, Warwick, Beaufort, Clifton, Harcourt, Mayfield, Ashgrove, Thornhill, Lark Rise, Primrose, Bramble, Heather, Fern, Clover, Kestrel, Swallow, Wren',
);
const ukSuffixes = list(
    'Road Road Road Street Street Lane Lane Avenue Close Close Drive Way Gardens Crescent Terrace Grove Place Court',
);
const ukPlaces: readonly Place[] = [
    place(
        'London',
        'Greater London',
        'LND',
        'N1 N7 N16 E2 E8 E17 SE1 SE15 SE22 SW2 SW9 SW11 SW18 W4 W12 NW1 NW5 NW6',
        '020 7946 0',
    ),
    place('Birmingham', 'West Midlands', 'BIR', 'B13 B14 B15 B16 B17 B29 B30', '0121 496 0'),
    place('Manchester', 'Greater Manchester', 'MAN', 'M14 M16 M19 M20 M21 M32', '0161 496 0'),
    place('Leeds', 'West Yorkshire', 'LDS', 'LS4 LS6 LS7 LS8 LS16 LS17', '0113 496 0'),
    place('Sheffield', 'South Yorkshire', 'SHF', 'S6 S7 S8 S10 S11 S17', '0114 496 0'),
    place('Nottingham', 'Nottinghamshire', 'NGM', 'NG2 NG3 NG5 NG7 NG9', '0115 496 0'),
    place('Leicester', 'Leicestershire', 'LCE', 'LE2 LE3 LE4 LE5', '0116 496 0'),
    place('Bristol', 'Bristol', 'BST', 'BS3 BS5 BS6 BS7 BS8 BS9', '0117 496 0'),
    place('Reading', 'Berkshire', 'RDG', 'RG1 RG2 RG4 RG6 RG30', '0118 496 0'),
    place('Edinburgh', 'City of Edinburgh', 'EDH', 'EH3 EH6 EH7 EH9 EH10 EH12', '0131 496 0'),
    place('Glasgow', 'Glasgow City', 'GLG', 'G3 G11 G12 G20 G41 G42', '0141 496 0'),
    place('Liverpool', 'Merseyside', 'LIV', 'L8 L15 L17 L18 L19', '0151 496 0'),
    place('Newcastle upon Tyne', 'Tyne and Wear', 'NET', 'NE2 NE3 NE4 NE6 NE7', '0191 498 0'),
    place('Cardiff', 'Cardiff', 'CRF', 'CF5 CF10 CF11 CF14 CF23 CF24', '029 2018 0'),
    place('Belfast', 'County Antrim', 'BFS', 'BT5 BT6 BT7 BT9 BT15', '028 9649 6'),
    place('Brighton', 'East Sussex', 'BNH', 'BN1 BN2 BN3', '07700 900'),
    place('Oxford', 'Oxfordshire', 'OXF', 'OX1 OX2 OX3 OX4', '07700 900'),
    place('Cambridge', 'Cambridgeshire', 'CAM', 'CB1 CB2 CB4 CB5', '07700 900'),
    place('Norwich', 'Norfolk', 'NFK', 'NR1 NR2 NR3 NR4', '07700 900'),
    place('York', 'North Yorkshire', 'YOR', 'YO10 YO23 YO24 YO30 YO31', '07700 900'),
    place('Bath', 'Somerset', 'BAS', 'BA1 BA2', '07700 900'),
    place('Exeter', 'Devon', 'DEV', 'EX1 EX2 EX4', '07700 900'),
    place('Southampton', 'Hampshire', 'STH', 'SO14 SO15 SO16 SO17', '07700 900'),
    place('Aberdeen', 'Aberdeen City', 'ABE', 'AB10 AB11 AB15 AB24', '07700 900'),
    place('Swansea', 'Swansea', 'SWA', 'SA1 SA2 SA3', '07700 900'),
    place('Coventry', 'West Midlands', 'COV', 'CV1 CV3 CV5 CV6', '07700 900'),
];
const deFemale = list(
    'Anna Lena Emma Mia Hannah Sophie Marie Laura Lea Julia Sarah Lisa Katharina Johanna Clara Charlotte Emilia Luisa Nele Amelie Paula Maja Greta Frieda Ida Mathilda Lina Ella Helena Antonia Carla Victoria Theresa Franziska Stefanie Christina Sabine Claudia Nicole Petra Monika Andrea Susanne Birgit Martina Heike Katrin Anja Daniela Melanie Nadine Sandra Jana Carolin Vanessa Jessica Annika Svenja Miriam Elif Aylin Zeynep',
);
const deMale = list(
    'Paul Leon Jonas Felix Lukas Maximilian Noah Elias Ben Finn Luis Henry Anton Emil Oskar Theo Jakob Moritz David Julian Niklas Tim Jan Philipp Alexander Tobias Florian Sebastian Daniel Christian Stefan Michael Thomas Andreas Markus Matthias Martin Frank Peter Klaus Wolfgang Jürgen Uwe Dieter Holger Torsten Sven Lars Dennis Marcel Kevin Patrick Dominik Fabian Simon Johannes Benedikt Konstantin Emre Can Mehmet',
);
const deLast = list(
    'Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Schäfer Koch Bauer Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange Schmitt Werner Schmitz Krause Meier Lehmann Schmid Schulze Maier Köhler Herrmann König Walter Mayer Huber Kaiser Fuchs Peters Lang Scholz Möller Weiß Jung Hahn Schubert Vogel Friedrich Keller Günther Frank Berger Winkler Roth Beck Lorenz Baumann Franke Albrecht Schuster Simon Ludwig Böhm Winter Kraus Martin Schumacher Krämer Vogt Stein Jäger Otto Sommer Groß Seidel Heinrich Brandt Haas Schreiber Graf Schulte Dietrich Ziegler Kuhn Kühn Pohl Engel Horn Busch Bergmann Thomas Voigt Sauer Arnold Wolff Pfeiffer Yılmaz Kaya Demir Şahin Çelik',
);
const deStreets = list(
    'Hauptstraße Schulstraße Gartenstraße Bahnhofstraße Dorfstraße Bergstraße Birkenweg Lindenstraße Kirchstraße Waldstraße Ringstraße Schillerstraße Goethestraße Amselweg Jahnstraße Wiesenweg Buchenweg Rosenstraße Feldstraße Mühlenweg Eichenweg Mozartstraße Friedhofstraße Blumenstraße Brunnenstraße Finkenweg Tannenweg Beethovenstraße Mittelstraße Ahornweg Uhlandstraße Kastanienallee Lessingstraße Parkstraße Wilhelmstraße Friedrichstraße Marktplatz Poststraße Industriestraße Kantstraße Bismarckstraße Humboldtstraße Sonnenallee Lerchenweg Drosselweg',
).concat(phrases('Am Stadtpark, Zum Weiher, An der Linde, Im Winkel, Auf der Heide'));
const dePlaces: readonly Place[] = [
    place(
        'Berlin',
        'Berlin',
        'BE',
        '10115 10247 10405 10437 10551 10623 10777 10961 12043 12159 13353',
        '030 23125',
    ),
    place('Hamburg', 'Hamburg', 'HH', '20095 20144 20253 20357 22085 22301 22765', '040 66969'),
    place('Norderstedt', 'Schleswig-Holstein', 'SH', '22844 22846 22848', '040 66969'),
    place('Frankfurt am Main', 'Hessen', 'HE', '60311 60316 60322 60385 60486 60594', '069 90009'),
    place('Offenbach am Main', 'Hessen', 'HE', '63065 63067 63069', '069 90009'),
    place('München', 'Bayern', 'BY', '80331 80469 80636 80796 81541 81667 81925', '089 99998'),
    place('Unterhaching', 'Bayern', 'BY', '82008', '089 99998'),
    place('Köln', 'Nordrhein-Westfalen', 'NW', '50667 50674 50733 50823 50931 51063', '0221 4710'),
    place('Bad Homburg vor der Höhe', 'Hessen', 'HE', '61348 61350 61352', '069 90009'),
    place('Garching bei München', 'Bayern', 'BY', '85748', '089 99998'),
    place('Bergisch Gladbach', 'Nordrhein-Westfalen', 'NW', '51465 51467 51469', '0221 4710'),
];
const frFemale = list(
    'Marie Camille Léa Manon Chloé Emma Inès Sarah Laura Julie Pauline Mathilde Lucie Anaïs Clara Juliette Louise Alice Jade Lina Zoé Charlotte Margaux Élise Céline Sophie Nathalie Isabelle Valérie Sandrine Stéphanie Caroline Aurélie Émilie Amandine Marion Justine Morgane Océane Clémence Agathe Jeanne Rose Ambre Anna Eva Léna Romane Capucine Apolline Yasmine Nour Aïcha Fatou',
);
const frMale = list(
    'Lucas Hugo Louis Gabriel Arthur Jules Léo Raphaël Adam Nathan Thomas Théo Antoine Maxime Alexandre Nicolas Julien Pierre Paul Baptiste Clément Quentin Romain Florian Guillaume Mathieu Benjamin Vincent Sébastien Olivier Laurent Stéphane Christophe Philippe Frédéric Jérôme David Kevin Anthony Valentin Adrien Bastien Corentin Damien Étienne Félix Gaspard Léon Noé Sacha Mohamed Mehdi Karim Yanis Ibrahim',
);
const frLast = list(
    'Martin Bernard Thomas Petit Robert Richard Durand Dubois Moreau Laurent Simon Michel Lefebvre Leroy Roux David Bertrand Morel Fournier Girard Bonnet Dupont Lambert Fontaine Rousseau Vincent Muller Lefèvre Faure André Mercier Blanc Guérin Boyer Garnier Chevalier François Legrand Gauthier Garcia Perrin Robin Clément Morin Nicolas Henry Roussel Mathieu Gautier Masson Marchand Duval Denis Dumont Marie Lemaire Noël Meyer Dufour Meunier Brun Blanchard Giraud Joly Rivière Lucas Brunet Gaillard Barbier Arnaud Martinez Gérard Roche Renard Schmitt Roy Leroux Colin Vidal Caron Picard Roger Fabre Aubert Lemoine Renaud Dumas Lacroix Olivier Philippe Bourgeois Pierre Benoît Rey Leclerc Payet Rolland Leclercq Guillaume Lecomte Lopez Jean Dupuy Guillot Hubert Berger Carpentier Sanchez Dupuis Moulin Louis Deschamps Huet Vasseur Perez Boucher Fleury Royer Klein Jacquet Adam Paris Poirier Marty Aubry Guyot Carré Charles Renault Charpentier Ménard Maillard Baron Bertin Bailly Hervé Schneider Fernandez Le Gall Collet Léger Bouvier Julien Prévost Millet Perrot Daniel Le Roux Cousin Germain Breton Besson Langlois Rémy Le Goff Pelletier Lévêque Perrier Leblanc Barré Lebrun Marchal Weber Mallet Hamon Boulanger Jacob Monnier Michaud Rodriguez Guichard Gillet Étienne Grondin Poulain Tessier Chevallier Collin Chauvin Da Silva Bouchet Gay Lemaître Bénard Maréchal Humbert Reynaud Antoine Hoarau Perret Barthélemy Cordier Pichon Lejeune Gilbert Lamy Delaunay Pasquier Carlier Laporte Benali Traoré Diallo',
);
const frStreets = phrases(
    'de la République, Victor Hugo, Jean Jaurès, de la Gare, de la Mairie, des Écoles, du Général de Gaulle, de la Liberté, Pasteur, Gambetta, du Moulin, des Lilas, des Acacias, du Château, de la Fontaine, des Tilleuls, Voltaire, Émile Zola, de Verdun, du Stade, de la Paix, Jules Ferry, des Jardins, du Marché, Saint-Michel, Nationale, de Paris, du Commerce, des Rosiers, de la Forêt, des Cerisiers, Carnot, Molière, Lamartine, Anatole France, Jean Moulin, des Vignes, du Lavoir, des Peupliers, de la Chapelle, du Four, des Mésanges, des Chênes, du Pont, Saint-Jean, Marcel Pagnol, Aristide Briand, Paul Bert, de la Poste, des Alouettes',
);
const frWays = list('rue rue rue rue rue avenue avenue boulevard impasse allée chemin place');
const frPlaces: readonly Place[] = [
    place(
        'Paris',
        'Île-de-France',
        'IDF',
        '75003 75005 75009 75010 75011 75012 75014 75015 75017 75018 75020',
        '01 99 00',
    ),
    place('Boulogne-Billancourt', 'Île-de-France', 'IDF', '92100', '01 99 00'),
    place('Versailles', 'Île-de-France', 'IDF', '78000', '01 99 00'),
    place('Montreuil', 'Île-de-France', 'IDF', '93100', '01 99 00'),
    place('Nantes', 'Pays de la Loire', 'PDL', '44000 44100 44200 44300', '02 61 91'),
    place('Rennes', 'Bretagne', 'BRE', '35000 35200 35700', '02 61 91'),
    place('Rouen', 'Normandie', 'NOR', '76000 76100', '02 61 91'),
    place('Tours', 'Centre-Val de Loire', 'CVL', '37000 37100 37200', '02 61 91'),
    place('Angers', 'Pays de la Loire', 'PDL', '49000 49100', '02 61 91'),
    place('Lille', 'Hauts-de-France', 'HDF', '59000 59160 59800', '03 53 01'),
    place('Strasbourg', 'Grand Est', 'GES', '67000 67100 67200', '03 53 01'),
    place('Reims', 'Grand Est', 'GES', '51100', '03 53 01'),
    place('Dijon', 'Bourgogne-Franche-Comté', 'BFC', '21000', '03 53 01'),
    place('Nancy', 'Grand Est', 'GES', '54000', '03 53 01'),
    place('Lyon', 'Auvergne-Rhône-Alpes', 'ARA', '69001 69003 69004 69006 69007 69008', '04 65 71'),
    place(
        'Marseille',
        "Provence-Alpes-Côte d'Azur",
        'PAC',
        '13001 13004 13005 13006 13008',
        '04 65 71',
    ),
    place('Nice', "Provence-Alpes-Côte d'Azur", 'PAC', '06000 06100 06200 06300', '04 65 71'),
    place('Grenoble', 'Auvergne-Rhône-Alpes', 'ARA', '38000 38100', '04 65 71'),
    place('Montpellier', 'Occitanie', 'OCC', '34000 34070 34090', '04 65 71'),
    place('Toulouse', 'Occitanie', 'OCC', '31000 31200 31300 31400 31500', '05 36 49'),
    place('Bordeaux', 'Nouvelle-Aquitaine', 'NAQ', '33000 33100 33200 33300 33800', '05 36 49'),
    place('Limoges', 'Nouvelle-Aquitaine', 'NAQ', '87000 87100', '05 36 49'),
    place('Pau', 'Nouvelle-Aquitaine', 'NAQ', '64000', '05 36 49'),
];
const caLast = list(
    'Smith Brown Tremblay Martin Roy Wilson MacDonald Gagnon Johnson Taylor Côté Campbell Anderson Leblanc Lee Jones White Williams Miller Thompson Gauthier Young Morin Bouchard Scott Stewart Pelletier Lavoie Fortin Wong Gagné Reid Clark Bélanger Chan Moore Robinson Ouellet Murray Mitchell Lévesque Landry Bergeron Poirier Kelly Singh Patel Li Wang Nguyen Kim Walker Wright Ross Fraser Thomas Graham Hamilton Kennedy Cameron Simard Girard Caron Beaulieu Cloutier Dubé Paquette Fournier Lapointe Richard Robertson Grant Mackenzie Morrison Henderson Sinclair Friesen Dyck Wiebe Penner Sandhu Dhillon Gill Grewal Chen Zhang Liu',
);
const caPlaces: readonly Place[] = [
    place('Toronto', 'Ontario', 'ON', 'M4C M4E M4K M5R M5T M6G M6H M6K M6P', '416'),
    place('Ottawa', 'Ontario', 'ON', 'K1N K1S K1Y K2A K2P', '613'),
    place('Mississauga', 'Ontario', 'ON', 'L4Z L5A L5B L5G L5M', '905'),
    place('Hamilton', 'Ontario', 'ON', 'L8L L8M L8P L8S', '905'),
    place('London', 'Ontario', 'ON', 'N5Y N6A N6C N6G', '519'),
    place('Montréal', 'Québec', 'QC', 'H2J H2T H2V H3H H4A H4C', '514'),
    place('Québec', 'Québec', 'QC', 'G1K G1R G1S G1V', '418'),
    place('Gatineau', 'Québec', 'QC', 'J8P J8T J8Y J9A', '819'),
    place('Vancouver', 'British Columbia', 'BC', 'V5K V5N V5T V6G V6K V6R', '604'),
    place('Victoria', 'British Columbia', 'BC', 'V8R V8S V8T V8V', '250'),
    place('Calgary', 'Alberta', 'AB', 'T2E T2M T2N T2S T2T T3A', '403'),
    place('Edmonton', 'Alberta', 'AB', 'T5H T5K T6C T6E T6G', '780'),
    place('Winnipeg', 'Manitoba', 'MB', 'R2H R3G R3L R3M', '204'),
    place('Saskatoon', 'Saskatchewan', 'SK', 'S7H S7K S7L S7N', '306'),
    place('Halifax', 'Nova Scotia', 'NS', 'B3H B3J B3K B3L', '902'),
    place('Moncton', 'New Brunswick', 'NB', 'E1A E1C E1E', '506'),
    place("St. John's", 'Newfoundland and Labrador', 'NL', 'A1A A1B A1C A1E', '709'),
    place('Charlottetown', 'Prince Edward Island', 'PE', 'C1A C1E', '902'),
];
const auLast = list(
    'Smith Jones Williams Brown Wilson Taylor Johnson White Martin Anderson Thompson Nguyen Thomas Walker Harris Lee Ryan Robinson Kelly King Davis Wright Evans Roberts Green Hall Wood Jackson Clarke Patel Campbell Mitchell Young Scott Stewart Murphy Cooper Edwards Turner Collins Morris Watson Hughes Baker Hill Moore Clark Allen Bell Ward Bennett Gray Murray Cook Shaw Richardson Marshall Simpson Graham Kennedy Reid Fraser McDonald OBrien Sullivan Walsh Fitzgerald Doyle Tran Chen Wang Li Zhang Singh Kaur Sharma Papadopoulos Rossi Russo Romano Pham Le Hoang Kowalski Novak Ali Khan',
);
const auStreets = phrases(
    'George, Victoria, Church, High, Station, Park, King, Queen, William, Elizabeth, Railway, Albert, John, Mary, Wattle, Banksia, Acacia, Eucalyptus, Kookaburra, Waratah, Jacaranda, Grevillea, Boronia, Melaleuca, Bottlebrush, Lilly Pilly, Ocean, Beach, Bay, Esplanade, Marine, Sunset, Hillview, Ridge, Valley, Creek, River, Lakeside, Forest, Gum Tree, Stringybark, Ironbark, Coolabah, Wirraway, Anzac, Macquarie, Flinders, Bourke, Collins, Murray, Darling, Sturt, Hume, Wentworth, Kingsford Smith',
);
const auSuffixes = list(
    'Street Street Street Road Road Avenue Avenue Drive Court Crescent Place Parade Close Way Lane',
);
const auPlaces: readonly Place[] = [
    place(
        'Sydney',
        'New South Wales',
        'NSW',
        '2000 2010 2016 2021 2026 2031 2037 2040 2042 2060 2088 2095',
        '02 5550',
    ),
    place('Parramatta', 'New South Wales', 'NSW', '2150', '02 5550'),
    place('Newcastle', 'New South Wales', 'NSW', '2289 2291 2300 2303', '02 5550'),
    place('Wollongong', 'New South Wales', 'NSW', '2500 2518 2519', '02 5550'),
    place('Canberra', 'Australian Capital Territory', 'ACT', '2600 2601 2602 2603 2612', '02 5550'),
    place(
        'Melbourne',
        'Victoria',
        'VIC',
        '3000 3031 3051 3056 3065 3068 3070 3121 3141 3181 3182',
        '03 5550',
    ),
    place('Geelong', 'Victoria', 'VIC', '3216 3218 3220', '03 5550'),
    place('Ballarat', 'Victoria', 'VIC', '3350 3355', '03 5550'),
    place('Hobart', 'Tasmania', 'TAS', '7000 7004 7005 7008', '03 5550'),
    place(
        'Brisbane',
        'Queensland',
        'QLD',
        '4000 4005 4006 4059 4064 4101 4102 4169 4171',
        '07 5550',
    ),
    place('Gold Coast', 'Queensland', 'QLD', '4215 4217 4218 4220', '07 5550'),
    place('Cairns', 'Queensland', 'QLD', '4870', '07 5550'),
    place('Townsville', 'Queensland', 'QLD', '4810 4812', '07 5550'),
    place('Perth', 'Western Australia', 'WA', '6000 6003 6007 6008 6050 6100 6151', '08 5550'),
    place('Fremantle', 'Western Australia', 'WA', '6160', '08 5550'),
    place('Adelaide', 'South Australia', 'SA', '5000 5006 5031 5034 5061 5063 5067', '08 5550'),
    place('Darwin', 'Northern Territory', 'NT', '0800 0810 0820', '08 5550'),
];
export const identityLocales = {
    'en-US': {
        country: 'US',
        countryName: 'United States',
        female: englishFemale,
        male: englishMale,
        last: usLast,
        streets: usStreets,
        suffixes: usSuffixes,
        places: usPlaces,
        companyEnd: ['LLC', 'LLC', 'Inc.', 'Inc.', 'Co.', 'Group', 'Partners', ''],
    },
    'en-GB': {
        country: 'GB',
        countryName: 'United Kingdom',
        female: englishFemale.slice(0, 160),
        male: englishMale.slice(0, 160),
        last: ukLast,
        streets: ukStreets,
        suffixes: ukSuffixes,
        places: ukPlaces,
        companyEnd: ['Ltd', 'Ltd', 'Limited', 'LLP', '& Co', 'Group', ''],
    },
    'en-CA': {
        country: 'CA',
        countryName: 'Canada',
        female: englishFemale.slice(0, 200),
        male: englishMale.slice(0, 200),
        last: caLast,
        streets: usStreets,
        suffixes: list('St St Ave Ave Dr Rd Cres Blvd Way Crt Pl'),
        places: caPlaces,
        companyEnd: ['Inc.', 'Inc.', 'Ltd.', 'Ltd.', 'Corp.', 'Group', ''],
    },
    'en-AU': {
        country: 'AU',
        countryName: 'Australia',
        female: englishFemale.slice(0, 180),
        male: englishMale.slice(0, 180),
        last: auLast,
        streets: auStreets,
        suffixes: auSuffixes,
        places: auPlaces,
        companyEnd: ['Pty Ltd', 'Pty Ltd', 'Pty Ltd', 'Group', '& Co', ''],
    },
    'de-DE': {
        country: 'DE',
        countryName: 'Germany',
        female: deFemale,
        male: deMale,
        last: deLast,
        streets: deStreets,
        suffixes: [],
        places: dePlaces,
        companyEnd: ['GmbH', 'GmbH', 'GmbH', 'GmbH & Co. KG', 'AG', 'UG', 'e.K.'],
    },
    'fr-FR': {
        country: 'FR',
        countryName: 'France',
        female: frFemale,
        male: frMale,
        last: frLast,
        streets: frStreets,
        suffixes: frWays,
        places: frPlaces,
        companyEnd: ['SARL', 'SARL', 'SAS', 'SAS', 'SA', 'EURL', '& Fils'],
    },
} as const satisfies Record<string, LocaleData>;
export type IdentityLocale = keyof typeof identityLocales;

export const companyFields: Record<'en' | 'de' | 'fr', readonly string[]> = {
    en: phrases(
        'Consulting, Logistics, Dental Care, Plumbing & Heating, Landscaping, Accounting, Roofing, Electric, Realty, Insurance Agency, Auto Repair, Construction, Physical Therapy, Veterinary Clinic, Architects, Engineering, Marketing, Design Studio, Software, Analytics, Law Offices, Financial Advisors, Property Management, Catering, Bakery, Coffee Roasters, Brewing, Print Shop, Cleaning Services, Home Inspections, Freight, Staffing, Pharmacy, Family Medicine, Animal Hospital, Builders, Cabinetry, Flooring, Travel, Fitness, Photography, Media, Publishing, Robotics, Biosciences, Energy, Solar, Security, Hardware, Foods',
    ),
    de: phrases(
        'Maschinenbau, Elektrotechnik, Steuerberatung, Bauunternehmen, Gebäudetechnik, Logistik, Spedition, Zahntechnik, Ingenieurbüro, Architekten, Immobilien, Versicherungsmakler, Autohaus, Schreinerei, Malerbetrieb, Dachdeckerei, Gartenbau, Softwareentwicklung, IT-Systemhaus, Unternehmensberatung, Werbeagentur, Druckerei, Bäckerei, Metallbau, Sanitär und Heizung, Medizintechnik, Verlag, Energieberatung, Solartechnik, Feinkost',
    ),
    fr: phrases(
        'Conseil, Transports, Bâtiment, Plomberie, Électricité, Menuiserie, Immobilier, Assurances, Expertise Comptable, Architecture, Ingénierie, Informatique, Communication, Imprimerie, Boulangerie, Traiteur, Paysagiste, Couverture, Peinture, Logistique, Formation, Pharmacie, Optique, Garage, Énergies, Solaire, Éditions, Design, Sécurité, Distribution',
    ),
};
export const companyNames = phrases(
    'Brightwater, Ironwood, Summit, Lakeshore, Pinnacle, Clearview, Northgate, Evergreen, Keystone, Silverline, Bluestone, Redwood, Harborview, Cornerstone, Meridian, Westbrook, Fairmont, Granite, Riverbend, Oakmont, Stonebridge, Highpoint, Crestline, Kingsley, Ashford, Bayside, Copperfield, Driftwood, Eastgate, Foxhill, Glenrock, Hawthorne, Ivywood, Larkspur, Millbrook, Newhaven, Parkside, Quarry Hill, Rosemont, Sterling, Thornbury, Upland, Vanguard, Whitfield, Yellowpine, Beacon, Cascade, Dovetail, Elmhurst, Frontier, Golden Gate, Heritage, Juniper, Kestrel, Lighthouse, Magnolia, Northwind, Orchard, Prairie, Sandhill, Tidewater, Unity, Valley Forge, Windmill',
);
export const jobTitles = phrases(
    'Registered Nurse, Software Engineer, Elementary School Teacher, Accountant, Project Manager, Electrician, Sales Representative, Marketing Manager, Graphic Designer, Operations Manager, Financial Analyst, Customer Service Representative, Mechanical Engineer, Pharmacist, Dental Hygienist, Physical Therapist, Human Resources Manager, Paralegal, Civil Engineer, Data Analyst, Web Developer, Office Manager, Truck Driver, Plumber, Carpenter, Chef, Real Estate Agent, Insurance Agent, Social Worker, Librarian, Police Officer, Firefighter, Paramedic, Veterinary Technician, Architect, Product Manager, UX Designer, Systems Administrator, Network Engineer, Database Administrator, Business Analyst, Executive Assistant, Bookkeeper, Loan Officer, Bank Teller, Retail Store Manager, Warehouse Supervisor, Purchasing Agent, Quality Assurance Engineer, Technical Writer, Recruiter, Occupational Therapist, Radiologic Technologist, Medical Assistant, Lab Technician, Research Scientist, Professor, High School Teacher, School Counselor, Journalist, Editor, Photographer, Interior Designer, Landscape Architect, Construction Manager, Welder, HVAC Technician, Auto Mechanic, Pilot, Flight Attendant, Hotel Manager, Event Planner, Restaurant Manager, Barista, Hair Stylist, Personal Trainer, Dietitian, Optometrist, Speech Pathologist, Attorney',
);
